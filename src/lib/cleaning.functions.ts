import { createServerFn } from "@tanstack/react-start";

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
export function cleanDataTS(type: "sales" | "purchase", data: any[]): { cleaned: any[]; imputedCount: number } {
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
      newRow['Category'] = getValCaseInsensitive(row, 'Category') || "Others";
      
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
    // 2. Procurement (purchase) clean
    const tempRows = data.map((row) => {
      const newRow: Record<string, any> = {};
      
      const vendorName = getValCaseInsensitive(row, 'Vendor Name', ['vendor_name', 'vendor', 'supplier', 'party_name', 'party name']);
      const invoiceNumber = getValCaseInsensitive(row, 'Invoice #', ['invoice_number', 'invoice number', 'bill #', 'bill_number', 'bill number', 'invoice #', 'ref']);
      const submissionDate = getValCaseInsensitive(row, 'Submission Date', ['submission_date', 'date', 'invoice date', 'bill_date']);
      const invoiceStatus = getValCaseInsensitive(row, 'Invoice Status', ['invoice_status', 'status']);
      const totalAmount = getValCaseInsensitive(row, 'Total Amount', ['total_amount', 'total', 'amount']);
      const balance = getValCaseInsensitive(row, 'Balance', ['balance']);
      const bv = getValCaseInsensitive(row, 'Business Vertical', ['business_vertical', 'vertical']);
      const division = getValCaseInsensitive(row, 'Division', ['division']);
      const expenseType = getValCaseInsensitive(row, 'Expense Type', ['expense_type', 'expense']);
      const debitNote = getValCaseInsensitive(row, 'Debit Note', ['debit_note', 'debit note']);
      const rejectionComments = getValCaseInsensitive(row, 'Rejection Comments', ['rejection_comments', 'rejection comment']);
      const paymentDate = getValCaseInsensitive(row, 'Payment Date', ['payment_date', 'payment date']);
      const bookingStatus = getValCaseInsensitive(row, 'Booking status (For Accounts only)', ['booking_status']);

      // Drop empty vendor names
      if (!vendorName || String(vendorName).trim() === "") {
        return null;
      }

      // Initial Assessment (Business Vertical fill from Division)
      let businessVertical = bv !== undefined && bv !== null && String(bv).trim() !== "" ? bv : division;
      if (businessVertical && String(businessVertical).trim() === "EPR") {
        businessVertical = "Plastic Operations";
      }

      // Filter irrelevant verticals
      if (businessVertical && ['admin', 'it', 'social inclusion', 'prf job work', 'qehs', 'marketing', 'general'].includes(String(businessVertical).trim().toLowerCase())) {
        return null;
      }

      if (businessVertical && String(businessVertical).trim() === "ZWP-Sales") {
        businessVertical = "ZWP Sales";
      }

      if (businessVertical && /ewaste/i.test(String(businessVertical))) {
        businessVertical = "Ewaste";
      }

      // Impute null Invoice Status
      let finalStatus = invoiceStatus || "";
      if (!finalStatus && rejectionComments) {
        finalStatus = "Rejected Invoices";
      } else if (!finalStatus && (paymentDate || bookingStatus === "Booked")) {
        finalStatus = "Full Paid Invoices";
      } else if (!finalStatus && (balance === 0 || balance === null || balance === undefined)) {
        finalStatus = "Full Paid Invoices";
      }

      // Debit Note imputation
      let finalDebitNote = debitNote;
      if (finalStatus === "Full Paid Invoices" && (debitNote === null || debitNote === undefined || debitNote === "")) {
        finalDebitNote = 0;
      }

      // Details splitting
      let itemName = getValCaseInsensitive(row, 'Item Name', ['item_name', 'item']) || "";
      let rate = getValCaseInsensitive(row, 'Rate per unit', ['rate_per_unit', 'rate']) || 0;
      let qty = getValCaseInsensitive(row, 'Quantity', ['quantity', 'qty']) || 1;
      let total = totalAmount || 0;

      // Populate row values
      newRow['Invoice #'] = invoiceNumber || ("BILL-TEMP-" + Math.floor(Math.random() * 100000));
      newRow['Vendor Name'] = String(vendorName).toUpperCase();
      newRow['Submission Date'] = submissionDate || new Date().toISOString().slice(0, 10);
      newRow['Invoice Status'] = finalStatus || "Open";
      newRow['Debit Note'] = finalDebitNote !== undefined ? Number(finalDebitNote) : "";
      newRow['Business Vertical'] = businessVertical || "";
      newRow['Division'] = division || "";
      newRow['Expense Type'] = expenseType || "Blanks Expense";
      newRow['Item Name'] = itemName;
      newRow['Rate per unit'] = Number(rate) || 0;
      newRow['Quantity'] = Number(qty) || 0;
      newRow['Total Amount'] = Number(total) || 0;
      newRow['Category'] = getValCaseInsensitive(row, 'Category') || "Others";
      newRow['GST Identification Number (GSTIN)'] = getValCaseInsensitive(row, 'GST Identification Number (GSTIN)') || "";
      newRow['Vendor Status'] = getValCaseInsensitive(row, 'Vendor Status') || "";
      newRow['Type'] = getValCaseInsensitive(row, 'Type') || "";
      newRow['Compliance Status'] = getValCaseInsensitive(row, 'Compliance Status') || "Non-compliant";
      newRow['City'] = getValCaseInsensitive(row, 'City') || "";

      // Drop BESCOM or PUMA
      if (vendorName && /BESCOM|PUMA/i.test(String(vendorName))) {
        return null;
      }

      return newRow;
    }).filter(Boolean) as any[];

    // Keep only targeted columns
    const purchaseCols = [
      'Invoice #', 'Vendor Name', 'Submission Date', 'Invoice Status', 'Debit Note',
      'Business Vertical', 'Division', 'Expense Type', 'Item Name', 'Rate per unit',
      'Quantity', 'Total Amount', 'Category', 'GST Identification Number (GSTIN)',
      'Vendor Status', 'Type', 'Compliance Status', 'City'
    ];
    
    const finalRows = tempRows.map(row => {
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

    // Deduplicate
    const seen = new Set();
    const uniqueRows = finalRows.filter(row => {
      const key = `${row['Invoice #']}-${row['Item Name']}-${row['Total Amount']}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { cleaned: uniqueRows, imputedCount };
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
