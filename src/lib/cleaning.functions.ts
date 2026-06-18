import { createServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { categorize } from "./category-lookup";

function parseDateString(str: string): Date | null {
  str = str.trim();
  // YYYY-MM-DD or YYYY/MM/DD
  let m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  // DD-MM-YYYY or DD/MM/YYYY
  m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  // DD-MM-YY or DD/MM/YY
  m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (m) {
    let year = Number(m[3]);
    year = year >= 80 ? 1900 + year : 2000 + year;
    return new Date(year, Number(m[2]) - 1, Number(m[1]));
  }
  // Fallback to standard parser
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function normalizeDate(val: any): string {
  if (val === null || val === undefined || val === "") return "";
  
  let d: Date | null = null;
  
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === "number") {
    if (val > 30000 && val < 60000) {
      d = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
      return String(val);
    }
  } else if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return "";
    
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = parseFloat(trimmed);
      if (num > 30000 && num < 60000) {
        d = new Date(Math.round((num - 25569) * 86400 * 1000));
      }
    }
    
    if (!d) {
      d = parseDateString(trimmed);
    }
  }
  
  if (d && !isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
  }
  
  return String(val);
}

export interface LogLine {
  source: "system" | "python" | "error";
  message: string;
  timestamp: string;
}

export interface CleaningResult {
  ok: boolean;
  error?: string;
  logs: LogLine[];
  salesCleaned: any[];
  purchaseCleaned: any[];
  stats: {
    salesRawCount: number;
    salesCleanedCount: number;
    salesImputedBalances: number;
    purchaseRawCount: number;
    purchaseCleanedCount: number;
    purchaseImputedBalances: number;
  };
}

// Client-side/portable clean function (TypeScript)
export function cleanDataTS(
  type: "sales" | "purchase", 
  data: any[],
  lookups?: {
    salesColumnsToKeep?: string[];
    salesCategoryMap?: Record<string, string>;
    itemDetailsMap?: Record<string, string>;
    refurbishmentItems?: { vendor: string; item: string }[];
    purchaseCategoryMap?: Record<string, { category: string; delete: boolean }>;
    vendorsMap?: Record<string, { gstin: string; status: string; type: string; city: string }>;
  }
): { cleaned: any[]; imputedCount: number } {
  let imputedCount = 0;

  const getValCaseInsensitive = (row: any, target: string, variations: string[] = []): any => {
    const targets = [target, ...variations].map(t => t.trim().toLowerCase());
    for (const key of Object.keys(row)) {
      if (targets.includes(key.trim().toLowerCase())) {
        return row[key];
      }
    }
    return undefined;
  };

  if (type === "sales") {
    // 1. Map columns case-insensitively and apply steps
    let cleaned: any[] = [];
    
    // First pass: map raw columns and do basic cleaning/imputation
    const tempRows = data.map((row) => {
      const newRow: Record<string, any> = {};
      
      // Get raw values with variations
      const customerName = getValCaseInsensitive(row, 'Customer Name', ['customer_name', 'customer', 'party_name', 'party name', 'client', 'party']);
      const invoiceNumber = getValCaseInsensitive(row, 'Invoice Number', ['invoice_number', 'invoice number', 'invoice #', 'ref']);
      const invoiceDate = getValCaseInsensitive(row, 'Invoice Date', ['invoice_date', 'date']);
      const invoiceStatus = getValCaseInsensitive(row, 'Invoice Status', ['invoice_status', 'status']);
      const itemTotal = getValCaseInsensitive(row, 'Item Total', ['item_total', 'total', 'item amount']);
      const balance = getValCaseInsensitive(row, 'Balance', ['balance']);
      const bv = getValCaseInsensitive(row, 'CF.Business Verticals', ['business_verticals', 'business vertical']);
      const division = getValCaseInsensitive(row, 'Division', ['division']);
      const salesPerson = getValCaseInsensitive(row, 'Sales person', ['sales_person', 'salesperson']);
      const itemDesc = getValCaseInsensitive(row, 'Item Desc', ['item_description', 'description']);
      const itemPrice = getValCaseInsensitive(row, 'Item Price', ['item_price', 'item price']);
      const dueDate = getValCaseInsensitive(row, 'Due Date', ['due_date', 'due date']);
      const lastPaymentDate = getValCaseInsensitive(row, 'Last Payment Date', ['last_payment_date', 'last payment date']);
      let itemName = getValCaseInsensitive(row, 'Item Name', ['item_name', 'item']);

      // Fill empty Item Name with Item Desc
      if (!itemName || String(itemName).trim() === "") {
        itemName = itemDesc || "";
      }

      // Drop JV and DN invoices
      if (invoiceNumber && /JV|DN/i.test(String(invoiceNumber))) {
        return null;
      }

      // Fill null CF.Business Verticals with Division
      let businessVerticals = bv !== undefined && bv !== null && String(bv).trim() !== "" ? bv : division;
      if (businessVerticals && /ewaste/i.test(String(businessVerticals))) {
        businessVerticals = "Ewaste";
      }

      // Void Invoice Status check
      if (invoiceStatus && String(invoiceStatus).trim().toLowerCase() === "void") {
        return null;
      }

      // Populate other standard columns case-insensitively from raw row
      const salesColsRaw = [
        'Place of Supply(With State Code)', 'GST Treatment', 'Payment Terms Label',
        'Location Name', 'Quantity', 'Item Type', 'Supply Type', 'Item Tax', 'Item Tax Amount',
        'Supplier City', 'Billing City', 'Billing State', 'Shipping City', 'Shipping State'
      ];
      
      salesColsRaw.forEach(col => {
        newRow[col] = getValCaseInsensitive(row, col) || "";
      });

      newRow['source_file'] = getValCaseInsensitive(row, 'source_file') || 'raw_sales.csv';
      newRow['source_sheet'] = getValCaseInsensitive(row, 'source_sheet') || 'Sheet1';
      newRow['Invoice Date'] = invoiceDate || new Date().toISOString().slice(0, 10);
      newRow['Invoice Number'] = invoiceNumber || ("INV-TEMP-" + Math.floor(Math.random() * 100000));
      newRow['Invoice Status'] = invoiceStatus || "Open";
      newRow['Customer Name'] = customerName || "Unknown Customer";
      newRow['Item Name'] = itemName || "";
      newRow['Item Total'] = Number(itemTotal) || 0;
      newRow['Item Price'] = Number(itemPrice) || 0;
      newRow['Due Date'] = dueDate || "";
      newRow['Last Payment Date'] = lastPaymentDate || "";
      newRow['Sales person'] = salesPerson || "";
      newRow['CF.Business Verticals'] = businessVerticals || "";
      newRow['Division'] = division || "";

      // Impute balances if missing or status is paid
      const numTotal = Number(itemTotal) || 0;
      let numBalance = balance !== undefined && balance !== null && balance !== "" ? Number(balance) : null;
      const strStatus = String(invoiceStatus || "").trim().toLowerCase();
      if (strStatus === "paid" || strStatus === "closed") {
        if (numBalance !== 0) {
          numBalance = 0;
          imputedCount++;
        }
      } else if (numBalance === null || isNaN(numBalance)) {
        numBalance = numTotal;
        imputedCount++;
      }
      newRow['Balance'] = numBalance;

      // Default Category values
      let category = "Others";
      if (lookups?.salesCategoryMap && lookups.salesCategoryMap[String(itemName).toUpperCase().trim()]) {
        category = lookups.salesCategoryMap[String(itemName).toUpperCase().trim()];
      } else {
        const localCat = categorize(itemName);
        if (localCat) category = localCat;
      }
      newRow['Category'] = category;
      
      return newRow;
    }).filter(Boolean) as any[];

    // Second pass: Calculate analytics/cohort metrics
    const customerEntryYears: Record<string, number> = {};
    tempRows.forEach(row => {
      const dateStr = String(row['Invoice Date']);
      const year = new Date(dateStr).getFullYear() || new Date().getFullYear();
      const cust = row['Customer Name'];
      if (!customerEntryYears[cust] || year < customerEntryYears[cust]) {
        customerEntryYears[cust] = year;
      }
    });

    const finalRows = tempRows.map(row => {
      const dateStr = String(row['Invoice Date']);
      const lpStr = String(row['Last Payment Date']);
      const dueStr = String(row['Due Date']);
      
      // Payment Delay
      let paymentDelay = 0;
      if (lpStr && dueStr) {
        const lp = new Date(lpStr);
        const due = new Date(dueStr);
        if (!isNaN(lp.getTime()) && !isNaN(due.getTime())) {
          paymentDelay = Math.round((lp.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
      row['Payment Delay'] = paymentDelay;

      // Entry Year
      row['Entry Year'] = customerEntryYears[row['Customer Name']] || new Date().getFullYear();

      // Quarter
      const invDate = new Date(dateStr);
      const q = Math.floor(invDate.getMonth() / 3) + 1;
      const quarterStr = `${invDate.getFullYear()}-Q${q}`;
      row['Quarter'] = quarterStr;

      // Gap, Recency State, Monetary Segment defaults
      row['Gap (quarters)'] = 0;
      row['Recency State'] = 1;
      
      const total = Number(row['Item Total']) || 0;
      if (total < 500) row['Monetary Segment'] = 'Low Value Tier';
      else if (total < 5000) row['Monetary Segment'] = 'Core Core-Retail Tier';
      else if (total < 50000) row['Monetary Segment'] = 'Mid-Market Commercial Tier';
      else row['Monetary Segment'] = 'Enterprise Major Tier';

      // Keep only targeted columns
      const finalRow: Record<string, any> = {};
      const salesCols = [
        'source_file', 'source_sheet', 'Invoice Date', 'Invoice Number', 'Invoice Status',
        'Customer Name', 'Place of Supply(With State Code)', 'GST Treatment', 'Due Date',
        'Payment Terms Label', 'Location Name', 'Item Name', 'Quantity', 'Item Total',
        'Sales person', 'Item Type', 'Supply Type', 'Item Tax', 'Item Tax Amount',
        'CF.Business Verticals', 'Last Payment Date', 'Supplier City', 'Item Price',
        'Division', 'Billing City', 'Billing State', 'Shipping City', 'Shipping State',
        'Category', 'Payment Delay', 'Entry Year', 'Quarter', 'Gap (quarters)',
        'Recency State', 'Monetary Segment'
      ];
      salesCols.forEach(col => {
        let val = row[col];
        if (col === 'Invoice Date' || col === 'Due Date' || col === 'Last Payment Date') {
          val = normalizeDate(val);
        }
        finalRow[col] = val !== undefined && val !== null ? val : "";
      });
      return finalRow;
    });

    // Deduplicate
    const seen = new Set();
    const uniqueRows = finalRows.filter(row => {
      const key = `${row['Invoice Number']}-${row['Item Name']}-${row['Item Total']}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { cleaned: uniqueRows, imputedCount };
  } else {
    // 2. Procurement (purchase) clean - IMPLEMENTING 37 MANDATORY STEPS
    
    // Step 1: Initial Missing Value Check (stats logged in console)
    const missingCounts: Record<string, number> = {};
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (row[key] === null || row[key] === undefined || String(row[key]).trim() === "") {
          missingCounts[key] = (missingCounts[key] || 0) + 1;
        }
      });
    });
    console.log("TS Initial Missing Value Check:", missingCounts);

    const tempRows = data.map((row) => {
      const newRow: Record<string, any> = {};
      
      const vendorNameRaw = getValCaseInsensitive(row, 'Vendor Name', ['vendor_name', 'vendor', 'supplier', 'party_name', 'party name']);
      const invoiceNumber = getValCaseInsensitive(row, 'Invoice #', ['invoice_number', 'invoice number', 'bill #', 'bill_number', 'bill number', 'invoice #', 'ref']);
      const submissionDateRaw = getValCaseInsensitive(row, 'Submission Date', ['submission_date', 'date', 'invoice date', 'bill_date']);
      const totalAmountRaw = getValCaseInsensitive(row, 'Total Amount', ['total_amount', 'total', 'amount']);
      const balance = getValCaseInsensitive(row, 'Balance', ['balance']);
      const bv = getValCaseInsensitive(row, 'Business Vertical', ['business_vertical', 'vertical']);
      const division = getValCaseInsensitive(row, 'Division', ['division']);
      const expenseTypeRaw = getValCaseInsensitive(row, 'Expense Type', ['expense_type', 'expense']);
      const debitNoteRaw = getValCaseInsensitive(row, 'Debit Note', ['debit_note', 'debit note']);
      const rejectionComments = getValCaseInsensitive(row, 'Rejection Comments', ['rejection_comments', 'rejection comment']);
      const paymentDate = getValCaseInsensitive(row, 'Payment Date', ['payment_date', 'payment date']);
      const bookingStatus = getValCaseInsensitive(row, 'Booking status (For Accounts only)', ['booking_status']);
      const sumOfBaseAmountRaw = getValCaseInsensitive(row, 'Sum of Base Amount', ['sum_of_base_amount', 'base_amount']);
      const sumOfTotalAmountRaw = getValCaseInsensitive(row, 'Sum of Total Amount', ['sum_of_total_amount', 'sum_total_amount']);
      const detailsRaw = getValCaseInsensitive(row, 'Details', ['details', 'item details']);
      const cityRaw = getValCaseInsensitive(row, 'City', ['city']);

      // Step 7: Drop Missing Vendor Names
      if (!vendorNameRaw || String(vendorNameRaw).trim() === "") {
        return null;
      }
      const vendorName = String(vendorNameRaw).trim();

      // Step 2: Business Vertical Imputation (Division)
      let businessVertical = (bv !== undefined && bv !== null && String(bv).trim() !== "") ? String(bv).trim() : String(division || "").trim();
      
      // Step 3: Business Vertical Standardization (EPR)
      if (businessVertical === "EPR") {
        businessVertical = "Plastic Operations";
      }

      // Step 4: Business Vertical Filtering (Admin, IT, Marketing, etc.)
      const nonCore = ['admin', 'it', 'marketing', 'social inclusion', 'prf job work', 'qehs', 'general'];
      if (nonCore.includes(businessVertical.toLowerCase())) {
        return null; // Remove row
      }

      // Step 5: Business Vertical Standardization (ZWP-Sales)
      if (businessVertical === "ZWP-Sales") {
        businessVertical = "ZWP Sales";
      }

      // Step 6: Business Vertical Standardization (Ewaste spellings check)
      if (/ewaste|e-waste|e\s+waste/i.test(businessVertical) || businessVertical.toLowerCase().includes("refurbishment")) {
        businessVertical = "Ewaste";
      }

      // Step 8: Expense Type Imputation
      let expenseType = "Blanks Expense";
      if (expenseTypeRaw !== undefined && expenseTypeRaw !== null && String(expenseTypeRaw).trim() !== "") {
        expenseType = String(expenseTypeRaw).trim();
      }

      // Step 9: Invoice Status Imputation (Rejection Comments)
      let invoiceStatus = getValCaseInsensitive(row, 'Invoice Status', ['invoice_status', 'status']) || "";
      invoiceStatus = String(invoiceStatus).trim();
      
      if (rejectionComments && String(rejectionComments).trim() !== "") {
        invoiceStatus = "Rejected Invoices";
      }

      // Step 10: Invoice Status Imputation (Payment Date / Booking Status)
      if (!invoiceStatus || invoiceStatus === "") {
        if ((paymentDate && String(paymentDate).trim() !== "") || String(bookingStatus).trim() === "Booked") {
          invoiceStatus = "Full Paid Invoices";
        }
      }

      // Step 11: Invoice Status Imputation (Balance)
      if (!invoiceStatus || invoiceStatus === "") {
        const numBal = Number(balance);
        if (balance === undefined || balance === null || balance === "" || numBal === 0 || isNaN(numBal)) {
          invoiceStatus = "Full Paid Invoices";
        }
      }

      // Step 12: Debit Note Imputation
      let debitNote = debitNoteRaw;
      if (invoiceStatus === "Full Paid Invoices") {
        if (debitNote === undefined || debitNote === null || String(debitNote).trim() === "") {
          debitNote = 0;
        } else {
          debitNote = Number(debitNote);
        }
      }

      // Setup raw metadata to pass down to exploded rows
      newRow['Invoice #'] = invoiceNumber || ("BILL-TEMP-" + Math.floor(Math.random() * 100000));
      newRow['Vendor Name'] = vendorName;
      newRow['Submission Date'] = submissionDateRaw || new Date().toISOString().slice(0, 10);
      newRow['Invoice Status'] = invoiceStatus || "Open";
      newRow['Debit Note'] = debitNote;
      newRow['Business Vertical'] = businessVertical;
      newRow['Division'] = division || "";
      newRow['Expense Type'] = expenseType;
      newRow['Category'] = getValCaseInsensitive(row, 'Category') || "";
      newRow['GST Identification Number (GSTIN)'] = getValCaseInsensitive(row, 'GST Identification Number (GSTIN)') || "";
      newRow['Vendor Status'] = getValCaseInsensitive(row, 'Vendor Status') || "";
      newRow['Type'] = getValCaseInsensitive(row, 'Type') || "";
      newRow['City'] = cityRaw || "";
      
      // Store raw details and amounts for split phase
      newRow['_raw_details'] = detailsRaw;
      newRow['_raw_total_amount'] = totalAmountRaw;
      newRow['_raw_sum_of_base'] = sumOfBaseAmountRaw;
      newRow['_raw_sum_of_total'] = sumOfTotalAmountRaw;

      return newRow;
    }).filter(Boolean) as any[];

    // Step 14 & 15: Details Column Standardization & Splitting
    let explodedRows: any[] = [];
    tempRows.forEach(row => {
      let details = String(row['_raw_details'] || "").trim();
      
      // Step 14: Details Column Standardization using Lookup Table if available
      if (lookups?.itemDetailsMap && lookups.itemDetailsMap[details]) {
        details = lookups.itemDetailsMap[details];
      }

      const totalAmountRaw = row['_raw_total_amount'];
      const sumOfBaseAmount = parseFloat(row['_raw_sum_of_base']) || 0;
      const sumOfTotalAmount = parseFloat(row['_raw_sum_of_total']) || 0;

      if (details) {
        // Explode comma separated details
        // Replace 'FY 20-21' with 'FY 20_21' to avoid splitting years
        const normalizedDetails = details.replace(/FY\s*20-21/gi, 'FY 20_21');
        const detailLines = normalizedDetails.split(',').map(p => p.trim()).filter(Boolean);

        detailLines.forEach(line => {
          // Split by dash followed by a digit
          const subParts = line.split(/-(?=\d)/);
          const itemName = (subParts[0] || "").trim();
          let rate = parseFloat(subParts[1]) || 0;
          let qty = parseFloat(subParts[2]) || 0;
          let totalAmount = parseFloat(subParts[3]) || 0;

          // Step 19: Total Amount Imputation
          if ((totalAmount === 0 || isNaN(totalAmount)) && itemName === line && sumOfBaseAmount > 0) {
            totalAmount = sumOfBaseAmount;
          }

          explodedRows.push({
            ...row,
            'Details': line,
            'Item Name': itemName,
            'Rate per unit': rate,
            'Quantity': qty,
            'Total Amount': totalAmount,
          });
        });
      } else {
        // No details column, get item name directly
        const itemName = getValCaseInsensitive(row, 'Item Name', ['item_name', 'item']) || "";
        let rate = parseFloat(getValCaseInsensitive(row, 'Rate per unit', ['rate_per_unit', 'rate'])) || 0;
        let qty = parseFloat(getValCaseInsensitive(row, 'Quantity', ['quantity', 'qty'])) || 0;
        let totalAmount = parseFloat(totalAmountRaw) || 0;

        explodedRows.push({
          ...row,
          'Details': '',
          'Item Name': String(itemName).trim(),
          'Rate per unit': rate,
          'Quantity': qty,
          'Total Amount': totalAmount,
        });
      }
    });

    // Step 16: Business Vertical Reclassification (Refurbishment)
    explodedRows.forEach(row => {
      const vendorNameUpper = String(row['Vendor Name']).trim().toUpperCase();
      const itemNameUpper = String(row['Item Name']).trim().toUpperCase();
      
      if (lookups?.refurbishmentItems) {
        const isRefurb = lookups.refurbishmentItems.some(
          item => item.vendor === vendorNameUpper && item.item === itemNameUpper
        );
        if (isRefurb) {
          row['Business Vertical'] = 'Refurbishment';
        }
      }
    });

    // Step 17: Drop Rows with Critical Missing Values
    let cleanRows = explodedRows.filter(row => {
      const vendor = row['Vendor Name'];
      const item = row['Item Name'];
      const date = row['Submission Date'];
      return vendor && item && date && String(vendor).trim() !== "" && String(item).trim() !== "" && String(date).trim() !== "";
    });

    // Step 20 & 21: Filter Out Specific MRF and Vendor Entries
    cleanRows = cleanRows.filter(row => {
      const bv = row['Business Vertical'];
      const status = row['Invoice Status'];
      const rate = Number(row['Rate per unit']) || 0;
      const total = Number(row['Total Amount']) || 0;
      const vendor = String(row['Vendor Name']).toUpperCase().trim();

      // Step 20: Filter Out Specific MRF Entries
      if (bv === 'MRF' && status === 'Full Paid Invoices' && rate === 0 && total === 0) {
        return false;
      }
      // Step 21: Filter Out Specific Vendor Entries
      if (vendor === 'SHRI MUNESWARA SWAMI PRASANNA' && status === 'Full Paid Invoices' && rate === 0 && total === 0) {
        return false;
      }
      return true;
    });

    // Step 22: Rate per Unit Calculation
    cleanRows.forEach(row => {
      let rate = Number(row['Rate per unit']) || 0;
      const qty = Number(row['Quantity']) || 0;
      const total = Number(row['Total Amount']) || 0;
      if (rate === 0 && qty !== 0) {
        row['Rate per unit'] = total / qty;
      }
    });

    // Step 23: Total Amount Adjustment (GST Purchases)
    cleanRows.forEach(row => {
      const status = row['Invoice Status'];
      const expenseType = row['Expense Type'];
      const itemName = row['Item Name'];
      const sumOfTotalAmount = parseFloat(row['_raw_sum_of_total']) || 0;

      if (status === 'Full Paid Invoices' && expenseType === 'GST Purchases' && ['CEEW1 - LED', 'LCD'].includes(itemName) && sumOfTotalAmount > 0) {
        row['Total Amount'] = sumOfTotalAmount / 1.18;
      }
    });

    // Step 24: Item Deletion (marked for deletion in category lookup table)
    if (lookups?.purchaseCategoryMap) {
      cleanRows = cleanRows.filter(row => {
        const itemUpper = String(row['Item Name']).trim().toUpperCase();
        return !(lookups.purchaseCategoryMap[itemUpper]?.delete);
      });
    }

    // Step 25: Hierarchical Median Imputation (Rate per unit & Quantity)
    const fpRows = cleanRows.filter(row => row['Invoice Status'] === 'Full Paid Invoices');
    
    const rateGroupLvl1: Record<string, number[]> = {};
    const rateGroupLvl2: Record<string, number[]> = {};
    const rateGlobalList: number[] = [];
    
    const qtyGroupLvl1: Record<string, number[]> = {};
    const qtyGroupLvl2: Record<string, number[]> = {};
    const qtyGlobalList: number[] = [];

    fpRows.forEach(row => {
      const bv = String(row['Business Vertical']).trim();
      const item = String(row['Item Name']).trim();
      const rate = Number(row['Rate per unit']);
      const qty = Number(row['Quantity']);
      const keyLvl1 = `${bv}_${item}`;

      if (!isNaN(rate) && rate > 0) {
        if (!rateGroupLvl1[keyLvl1]) rateGroupLvl1[keyLvl1] = [];
        rateGroupLvl1[keyLvl1].push(rate);

        if (!rateGroupLvl2[bv]) rateGroupLvl2[bv] = [];
        rateGroupLvl2[bv].push(rate);

        rateGlobalList.push(rate);
      }

      if (!isNaN(qty) && qty > 0) {
        if (!qtyGroupLvl1[keyLvl1]) qtyGroupLvl1[keyLvl1] = [];
        qtyGroupLvl1[keyLvl1].push(qty);

        if (!qtyGroupLvl2[bv]) qtyGroupLvl2[bv] = [];
        qtyGroupLvl2[bv].push(qty);

        qtyGlobalList.push(qty);
      }
    });

    const getMedian = (arr: number[]): number => {
      if (!arr || arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const rateLvl1Medians: Record<string, number> = {};
    Object.keys(rateGroupLvl1).forEach(k => { rateLvl1Medians[k] = getMedian(rateGroupLvl1[k]); });
    const rateLvl2Medians: Record<string, number> = {};
    Object.keys(rateGroupLvl2).forEach(k => { rateLvl2Medians[k] = getMedian(rateGroupLvl2[k]); });
    const rateGlobalMedian = getMedian(rateGlobalList);

    const qtyLvl1Medians: Record<string, number> = {};
    Object.keys(qtyGroupLvl1).forEach(k => { qtyLvl1Medians[k] = getMedian(qtyGroupLvl1[k]); });
    const qtyLvl2Medians: Record<string, number> = {};
    Object.keys(qtyGroupLvl2).forEach(k => { qtyLvl2Medians[k] = getMedian(qtyGroupLvl2[k]); });
    const qtyGlobalMedian = getMedian(qtyGlobalList);

    cleanRows.forEach(row => {
      if (row['Invoice Status'] === 'Full Paid Invoices') {
        const bv = String(row['Business Vertical']).trim();
        const item = String(row['Item Name']).trim();
        const keyLvl1 = `${bv}_${item}`;
        
        let rate = Number(row['Rate per unit']);
        let qty = Number(row['Quantity']);

        if (isNaN(rate) || rate === 0) {
          rate = rateLvl1Medians[keyLvl1] || rateLvl2Medians[bv] || rateGlobalMedian || 0;
          row['Rate per unit'] = rate;
          imputedCount++;
        }

        if (isNaN(qty) || qty === 0) {
          qty = qtyLvl1Medians[keyLvl1] || qtyLvl2Medians[bv] || qtyGlobalMedian || 0;
          row['Quantity'] = qty;
          imputedCount++;
        }

        // Step 26: Recalculate Total Amount
        row['Total Amount'] = rate * qty;
      }
    });

    // Step 27: Filter by Expense Type
    const validExpenseTypes = [
      'GST Purchases', 'Operations-Transpotation Charges', 'Purchases from Unregistered dealer',
      'Consumables', 'Professional Service Fees', 'Admin-Professional & Consultancy Charges',
      'Scrap Handling & Transporatation', 'Office Stationary and Consumables', 'Operation A - PPE and Consumables',
      'Consultants-Sales, BD, cRM', 'Operations-Rejects/ Wet Waste Collection', 'Operations-Stationary N Printing',
      'Raw Materials', 'Auditing and Company Sec Charges', 'Website Development Charges',
      'Operations Communication Expenses', 'Operation-Shredding & Baling Charges', 'Blank Expense', 'Blanks Expense'
    ].map(e => e.toLowerCase().trim());

    cleanRows = cleanRows.filter(row => {
      const exp = String(row['Expense Type'] || "").toLowerCase().trim();
      return validExpenseTypes.includes(exp);
    });

    // Step 28: Category Imputation
    cleanRows.forEach(row => {
      const itemName = String(row['Item Name']).trim();
      const itemUpper = itemName.toUpperCase();
      let category = "";

      if (lookups?.purchaseCategoryMap && lookups.purchaseCategoryMap[itemUpper]) {
        category = lookups.purchaseCategoryMap[itemUpper].category;
      } else {
        const localCat = categorize(itemName);
        if (localCat) category = localCat;
      }

      // Apply overrides (Redenim, Sarvam, Milestone)
      if (/Redenim/i.test(itemName)) {
        category = 'Bags';
      } else if (/Sarvam.*Monitoring/i.test(itemName) || itemName === 'GUN ‐ COMMERCIAL') {
        category = 'Others';
      } else if (/Milestone/i.test(itemName)) {
        category = 'IT';
      }

      if (!category) {
        category = "Others";
      }

      row['Category'] = category;
    });

    // Step 29: Drop Missing Categories
    cleanRows = cleanRows.filter(row => {
      const cat = row['Category'];
      return cat && String(cat).trim() !== "";
    });

    // Step 30: Remove Duplicate Rows (Deduplicate)
    const seen = new Set();
    cleanRows = cleanRows.filter(row => {
      const key = `${row['Invoice #']}-${row['Item Name']}-${row['Total Amount']}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Step 31 to 37: Vendor master cleanse and mapping
    let finalRows: any[] = [];
    cleanRows.forEach(row => {
      const vendorNameRaw = String(row['Vendor Name']).trim();
      const vendorNameUpper = vendorNameRaw.toUpperCase();

      // Step 36: Vendor Name Standardization (BESCOM / PUMA drop)
      if (vendorNameUpper.includes("BESCOM") || vendorNameUpper.includes("PUMA")) {
        return; // drop row
      }
      row['Vendor Name'] = vendorNameUpper;

      // Get standardized lookup data from vendorsMap
      const vendorDetails = lookups?.vendorsMap ? lookups.vendorsMap[vendorNameUpper] : null;

      // Step 33: Filter Out Rejected Invoices
      if (row['Invoice Status'] === 'Rejected Invoices') {
        return; // drop row
      }

      // Step 34: Filter Out Inactive Vendors
      if (vendorDetails?.status === 'Vendor Inactive.') {
        return; // drop row
      }

      // Fill GSTIN, Vendor Status, Type from lookup if available
      if (vendorDetails) {
        if (vendorDetails.gstin) {
          row['GST Identification Number (GSTIN)'] = vendorDetails.gstin;
        }
        if (vendorDetails.status) {
          row['Vendor Status'] = vendorDetails.status;
        }
        if (vendorDetails.type) {
          row['Type'] = vendorDetails.type;
        }
      }

      // Step 37: City Imputation
      const currentCity = String(row['City'] || "").trim();
      if (!currentCity && vendorDetails?.city) {
        row['City'] = vendorDetails.city;
      }

      // Step 35: Compliance Status Imputation
      let compliance = 'Non-compliant';
      const gstin = String(row['GST Identification Number (GSTIN)'] || "").trim();
      const vendorStatus = String(row['Vendor Status'] || "").trim();
      const type = String(row['Type'] || "").trim();

      if (gstin && gstin !== "") {
        compliance = 'Compliant';
      } else if (['Vendor Registered.', 'Vendor Validated.'].includes(vendorStatus)) {
        compliance = 'Compliant';
      } else if (type === 'Registered') {
        compliance = 'Compliant';
      } else if (type === 'Unregistered') {
        compliance = 'Non-compliant';
      }

      if (row['Expense Type'] === 'GST Purchases') {
        compliance = 'Compliant';
      }

      row['Compliance Status'] = compliance;

      // Clean up temporary properties that shouldn't leak to schema
      delete row['_raw_sum_of_total'];

      finalRows.push(row);
    });

    // Map to exact target columns schema
    const purchaseCols = [
      'Invoice #', 'Vendor Name', 'Submission Date', 'Invoice Status', 'Debit Note',
      'Business Vertical', 'Division', 'Expense Type', 'Item Name', 'Rate per unit',
      'Quantity', 'Total Amount', 'Category', 'GST Identification Number (GSTIN)',
      'Vendor Status', 'Type', 'Compliance Status', 'City'
    ];

    const processedRows = finalRows.map(row => {
      const finalRow: Record<string, any> = {};
      purchaseCols.forEach(col => {
        let val = row[col];
        if (col === 'Submission Date') {
          val = normalizeDate(val);
        }
        finalRow[col] = val !== undefined && val !== null ? val : "";
      });
      return finalRow;
    });

    return { cleaned: processedRows, imputedCount };
  }
}

// Server function to execute python script locally on the server
export const runPythonCleaning = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      salesCsv: string;
      purchaseCsv: string;
      salesScript: string;
      purchaseScript: string;
    } | undefined) => data!
  )
  .handler(async ({ data }): Promise<CleaningResult> => {
    const logs: LogLine[] = [];
    const addLog = (source: "system" | "python" | "error", message: string) => {
      logs.push({
        source,
        message,
        timestamp: new Date().toLocaleTimeString(),
      });
    };

    addLog("system", "Starting Python data cleaning pipeline on host system...");

    try {
      // Dynamic imports for Node dependencies, ensuring Cloudflare compilation safety
      const fs = typeof window === "undefined" ? await import("fs/promises") : null;
      const path = typeof window === "undefined" ? await import("path") : null;
      const cp = typeof window === "undefined" ? await import("child_process") : null;
      const os = typeof window === "undefined" ? await import("os") : null;

      if (!fs || !path || !cp || !os) {
        throw new Error("Local filesystem and process execution modules are not available in this environment.");
      }

      // 1. Setup temporary workspace directory inside the project
      const tempDir = path.join(process.cwd(), "scratch_cleaning");
      addLog("system", `Creating workspace at: ${tempDir}`);
      
      await fs.mkdir(tempDir, { recursive: true });

      // 2. Write CSV data inputs
      const salesRawPath = path.join(tempDir, "raw_sales.csv");
      const purchaseRawPath = path.join(tempDir, "raw_purchase.csv");
      await fs.writeFile(salesRawPath, data.salesCsv, "utf-8");
      await fs.writeFile(purchaseRawPath, data.purchaseCsv, "utf-8");
      
      addLog("system", "Wrote raw data inputs: raw_sales.csv & raw_purchase.csv");

      // 3. Write python scripts
      const salesScriptPath = path.join(tempDir, "clean_sales.py");
      const purchaseScriptPath = path.join(tempDir, "clean_purchase.py");
      await fs.writeFile(salesScriptPath, data.salesScript, "utf-8");
      await fs.writeFile(purchaseScriptPath, data.purchaseScript, "utf-8");
      
      addLog("system", "Wrote Python cleaning scripts: clean_sales.py & clean_purchase.py");

      const execPythonFile = async (scriptPath: string): Promise<string> => {
        // Check if there is a local virtual environment Python first
        const localVenvPy = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
        const venvExists = await fs.access(localVenvPy).then(() => true).catch(() => false);
        const cmd = venvExists ? `"${localVenvPy}"` : "python";
        
        return new Promise((resolve, reject) => {
          addLog("system", `Executing Python command: ${cmd} "${scriptPath}"`);
          
          cp.exec(`${cmd} "${scriptPath}"`, { cwd: tempDir }, (error: any, stdout: string, stderr: string) => {
            if (stdout) {
              stdout.split("\n").forEach((line) => {
                if (line.trim()) addLog("python", line.trim());
              });
            }
            if (stderr) {
              stderr.split("\n").forEach((line) => {
                if (line.trim()) addLog("error", line.trim());
              });
            }
            if (error) {
              reject(new Error(`Python script failed with code ${error.code}: ${error.message}`));
            } else {
              resolve(stdout);
            }
          });
        });
      };

      // Check/install python dependencies
      const installDeps = async (): Promise<void> => {
        const localVenvPy = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
        const venvExists = await fs.access(localVenvPy).then(() => true).catch(() => false);
        
        let pipCmd = "pip";
        if (venvExists) {
          const localVenvPip = path.join(process.cwd(), ".venv", "Scripts", "pip.exe");
          const pipExists = await fs.access(localVenvPip).then(() => true).catch(() => false);
          if (pipExists) {
            pipCmd = `"${localVenvPip}"`;
          }
        }
        
        addLog("system", `Checking & installing Python dependencies via: ${pipCmd} install pandas openpyxl thefuzz`);
        
        return new Promise((resolve) => {
          cp.exec(`${pipCmd} install pandas openpyxl thefuzz`, (error, stdout, stderr) => {
            if (error) {
              addLog("error", `Dependency check warning: ${error.message || String(error)}`);
            } else {
              addLog("system", "Python dependencies verified / installed successfully.");
            }
            resolve();
          });
        });
      };

      // 4. Run Python scripts
      addLog("system", "Verifying dependencies...");
      await installDeps();

      addLog("system", "Running Sales cleaning script...");
      await execPythonFile(salesScriptPath);
      
      addLog("system", "Running Purchase cleaning script...");
      await execPythonFile(purchaseScriptPath);
      
      // 5. Read clean CSV outputs
      const salesCleanPath = path.join(tempDir, "sales_clean.csv");
      const purchaseCleanPath = path.join(tempDir, "purchase_clean.csv");
      
      const salesCleanExists = await fs.access(salesCleanPath).then(() => true).catch(() => false);
      const purchaseCleanExists = await fs.access(purchaseCleanPath).then(() => true).catch(() => false);

      if (!salesCleanExists || !purchaseCleanExists) {
        throw new Error(
          `Imputed output files were not generated. Sales output: ${
            salesCleanExists ? "Found" : "MISSING"
          }, Purchase output: ${purchaseCleanExists ? "Found" : "MISSING"}`
        );
      }

      const salesCleanedContent = await fs.readFile(salesCleanPath, "utf-8");
      const purchaseCleanedContent = await fs.readFile(purchaseCleanPath, "utf-8");

      // Simple CSV parser to convert back to JSON array of objects
      const parseCSV = (csv: string): any[] => {
        const lines = csv.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return [];
        
        // Handle headers
        const headers = lines[0].split(",").map(h => h.replace(/^["']|["']$/g, "").trim());
        
        return lines.slice(1).map(line => {
          // Simple regex to parse CSV taking care of quotes
          const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(",");
          const obj: any = {};
          headers.forEach((header, index) => {
            let val = matches[index] || "";
            val = val.replace(/^["']|["']$/g, "").trim();
            
            // Cast numeric strings if possible
            if (!isNaN(val as any) && val !== "") {
              obj[header] = Number(val);
            } else {
              obj[header] = val;
            }
          });
          return obj;
        });
      };

      const salesCleaned = parseCSV(salesCleanedContent);
      const purchaseCleaned = parseCSV(purchaseCleanedContent);

      addLog("system", `Successfully read cleaned data: ${salesCleaned.length} sales records, ${purchaseCleaned.length} purchase records.`);

      // Clean up temp workspace files
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        addLog("system", "Cleaned up temporary workspace directory.");
      } catch (rmErr) {
        addLog("system", `Warning during cleanup: ${String(rmErr)}`);
      }

      return {
        ok: true,
        logs,
        salesCleaned,
        purchaseCleaned,
        stats: {
          salesRawCount: data.salesCsv.split("\n").filter(Boolean).length - 1,
          salesCleanedCount: salesCleaned.length,
          salesImputedBalances: 0, // Set to 0 since python handled it internally
          purchaseRawCount: data.purchaseCsv.split("\n").filter(Boolean).length - 1,
          purchaseCleanedCount: purchaseCleaned.length,
          purchaseImputedBalances: 0,
        }
      };
    } catch (e: any) {
      addLog("error", `Exception occurred: ${e.message || String(e)}`);
      return {
        ok: false,
        error: e.message || String(e),
        logs,
        salesCleaned: [],
        purchaseCleaned: [],
        stats: {
          salesRawCount: 0,
          salesCleanedCount: 0,
          salesImputedBalances: 0,
          purchaseRawCount: 0,
          purchaseCleanedCount: 0,
          purchaseImputedBalances: 0,
        }
      };
    }
  });

export const loadCleaningLookups = createServerFn({ method: "GET" })
  .handler(async (): Promise<{
    salesColumnsToKeep: string[];
    salesCategoryMap: Record<string, string>;
    itemDetailsMap: Record<string, string>;
    refurbishmentItems: { vendor: string; item: string }[];
    purchaseCategoryMap: Record<string, { category: string; delete: boolean }>;
    vendorsMap: Record<string, { gstin: string; status: string; type: string; city: string }>;
  }> => {
    const fs = typeof window === "undefined" ? await import("fs") : null;
    const path = typeof window === "undefined" ? await import("path") : null;
    
    if (!fs || !path) {
      return {
        salesColumnsToKeep: [],
        salesCategoryMap: {},
        itemDetailsMap: {},
        refurbishmentItems: [],
        purchaseCategoryMap: {},
        vendorsMap: {},
      };
    }

    const readRootFile = (fileName: string): Buffer | null => {
      const p = path.join(process.cwd(), fileName);
      if (fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
      return null;
    };

    // 1. Sales_lookup.csv
    const salesColumnsToKeep: string[] = [];
    const salesLookupBuf = readRootFile("Sales_lookup.csv");
    if (salesLookupBuf) {
      try {
        const workbook = XLSX.read(salesLookupBuf, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
        json.forEach((row: any) => {
          if (row && row[0]) {
            salesColumnsToKeep.push(String(row[0]).trim());
          }
        });
      } catch (err) {
        console.error("Error reading Sales_lookup.csv:", err);
      }
    }

    // 2. Sales categories
    const salesCategoryMap: Record<string, string> = {};
    const salesCatBuf = readRootFile("Item_Cat_Update  saless.csv");
    if (salesCatBuf) {
      try {
        const workbook = XLSX.read(salesCatBuf, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet);
        json.forEach((row: any) => {
          const item = row["Item Name"] || row["item_name"] || row["Item"];
          const cat = row["Category"] || row["category"];
          if (item && cat) {
            salesCategoryMap[String(item).trim().toUpperCase()] = String(cat).trim();
          }
        });
      } catch (err) {
        console.error("Error reading Item_Cat_Update  saless.csv:", err);
      }
    }
    const salesExcelCatBuf = readRootFile("Item_Cat_Sales_Update (1).xlsx");
    if (salesExcelCatBuf) {
      try {
        const workbook = XLSX.read(salesExcelCatBuf, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet);
        json.forEach((row: any) => {
          const item = row["Item"] || row["Item Name"] || row["item_name"];
          const cat = row["Category"] || row["category"];
          if (item && cat) {
            salesCategoryMap[String(item).trim().toUpperCase()] = String(cat).trim();
          }
        });
      } catch (err) {
        console.error("Error reading Item_Cat_Sales_Update (1).xlsx:", err);
      }
    }

    // 3. item_details_lookup_purchase.csv (details standardisation)
    const itemDetailsMap: Record<string, string> = {};
    const detailsBuf = readRootFile("item_details_lookup_purchase.csv");
    if (detailsBuf) {
      try {
        const workbook = XLSX.read(detailsBuf, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet);
        json.forEach((row: any) => {
          const orig = row["Details_lookup"] || row["Original"] || Object.values(row)[0];
          const ref = row["Details Refined"] || row["Refined"] || Object.values(row)[1];
          if (orig && ref) {
            itemDetailsMap[String(orig).trim()] = String(ref).trim();
          }
        });
      } catch (err) {
        console.error("Error reading item_details_lookup_purchase.csv:", err);
      }
    }

    // 4. Lookup_items.xls (Refurbishment lookup)
    const refurbishmentItems: { vendor: string; item: string }[] = [];
    const lookupItemsBuf = readRootFile("Lookup_items.xls");
    if (lookupItemsBuf) {
      try {
        const workbook = XLSX.read(lookupItemsBuf, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet);
        json.forEach((row: any) => {
          const vendorCol = Object.keys(row).find(k => /vendor/i.test(k));
          const itemCol = Object.keys(row).find(k => /item/i.test(k));
          if (vendorCol && itemCol && row[vendorCol] && row[itemCol]) {
            refurbishmentItems.push({
              vendor: String(row[vendorCol]).trim().toUpperCase(),
              item: String(row[itemCol]).trim().toUpperCase(),
            });
          }
        });
      } catch (err) {
        console.error("Error reading Lookup_items.xls:", err);
      }
    }

    // 5. Purchase_Items_Lookup_Category.csv
    const purchaseCategoryMap: Record<string, { category: string; delete: boolean }> = {};
    const purchaseCatBuf = readRootFile("Purchase_Items_Lookup_Category.csv");
    if (purchaseCatBuf) {
      try {
        const workbook = XLSX.read(purchaseCatBuf, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet);
        json.forEach((row: any) => {
          const item = row["Item Name"] || row["item_name"] || row["Item"];
          const cat = row["Category"] || row["category"];
          const delVal = row["Delete"] !== undefined && row["Delete"] !== null && String(row["Delete"]).trim() !== "";
          if (item && cat) {
            purchaseCategoryMap[String(item).trim().toUpperCase()] = {
              category: String(cat).trim(),
              delete: delVal,
            };
          }
        });
      } catch (err) {
        console.error("Error reading Purchase_Items_Lookup_Category.csv:", err);
      }
    }

    // 6. Vendors_Status.csv
    const vendorsMap: Record<string, { gstin: string; status: string; type: string; city: string }> = {};
    const vendorsBuf = readRootFile("Vendors_Status.csv");
    if (vendorsBuf) {
      try {
        const workbook = XLSX.read(vendorsBuf, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet);
        
        const rawVendors: any[] = json.map((row: any) => {
          const name = String(row["Vendor Name"] || "").trim().toUpperCase();
          let status = String(row["Vendor Status"] || "").trim();
          if (status === "Vendor Registered") status = "Vendor Registered.";
          
          let type = String(row["Type"] || "").trim();
          if (type === "Unregistered Business") {
            type = "Unregistered";
          } else if (["Registered Business - Regular", "Registered Business - Composition", "Registered Business"].includes(type)) {
            type = "Registered";
          }
          
          return {
            name,
            gstin: String(row["GST Identification Number (GSTIN)"] || "").trim(),
            status,
            type,
            city: String(row["City"] || "").trim(),
          };
        }).filter(v => v.name);

        const nameCounts: Record<string, number> = {};
        rawVendors.forEach(v => {
          nameCounts[v.name] = (nameCounts[v.name] || 0) + 1;
        });

        const uniqueVendors = rawVendors.filter(v => nameCounts[v.name] === 1);
        const duplicateVendors = rawVendors.filter(v => nameCounts[v.name] > 1);

        uniqueVendors.forEach(v => {
          vendorsMap[v.name] = { gstin: v.gstin, status: v.status, type: v.type, city: v.city };
        });

        const validStatus = ["Vendor Validated.", "Vendor Registered.", "SZW POC Verified."];
        const validVendorsNames = new Set(
          duplicateVendors.filter(v => validStatus.includes(v.status)).map(v => v.name)
        );

        const resolvedDuplicates: Record<string, any> = {};
        duplicateVendors.forEach(v => {
          const hasValid = validVendorsNames.has(v.name);
          if (hasValid && !validStatus.includes(v.status)) {
            return;
          }
          if (!resolvedDuplicates[v.name]) {
            resolvedDuplicates[v.name] = { gstin: v.gstin, status: v.status, type: v.type, city: v.city };
          }
        });

        Object.assign(vendorsMap, resolvedDuplicates);
      } catch (err) {
        console.error("Error reading Vendors_Status.csv:", err);
      }
    }

    return {
      salesColumnsToKeep,
      salesCategoryMap,
      itemDetailsMap,
      refurbishmentItems,
      purchaseCategoryMap,
      vendorsMap,
    };
  });
