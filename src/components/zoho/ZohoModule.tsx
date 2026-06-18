import { useState } from "react";
import {
  Cable,
  Sparkles,
  CheckCircle2,
  Loader2,
  Database,
  ShieldCheck,
  Wand2,
  RefreshCw,
  AlertTriangle,
  Download,
  Upload,
  Play,
  Terminal,
  ArrowRight,
  FileText,
  Check,
  FileSpreadsheet,
  Code,
  Copy,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/data/MetricCard";
import { Logo } from "@/components/brand/Logo";
import * as XLSX from "xlsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runPythonCleaning, cleanDataTS, normalizeDate, loadCleaningLookups, type LogLine } from "@/lib/cleaning.functions";

import { syncZohoBooks, type SyncResult } from "@/lib/zoho.functions";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell as PieCell,
  Legend,
} from "recharts";

const STEPS = [
  { label: "Authenticating via Zoho OAuth 2.0…", icon: ShieldCheck },
  { label: "Pulling live invoice ledger from Zoho Books…", icon: Database },
  { label: "Aggregating KPIs & imputing balances…", icon: Wand2 },
];

type Phase = "idle" | "syncing" | "done" | "error";

const PIE_COLORS = [
  "oklch(0.696 0.17 162.48)",
  "oklch(0.609 0.155 163.225)",
  "oklch(0.279 0.041 260.031)",
  "oklch(0.554 0.046 257.417)",
  "oklch(0.75 0.14 80)",
  "oklch(0.65 0.15 25)",
];

function formatMoney(n: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString("en-IN")}`;
  }
}

function exportInvoicesToCSV(invoices: SyncResult["allInvoices"], currency: string) {
  const headers = ["Invoice ID", "Invoice Number", "Customer Name", "Status", "Date", "Due Date", "Total", "Balance", "Currency"];
  const rows = invoices.map((inv) => [
    inv.invoice_id ?? "",
    inv.invoice_number ?? "",
    inv.customer_name ?? "",
    inv.status ?? "",
    inv.date ?? "",
    inv.due_date ?? "",
    String(inv.total ?? 0),
    String(inv.balance ?? 0),
    inv.currency_code ?? currency,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zoho-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const DEFAULT_SALES_PY = `import os
import pandas as pd
import numpy as np
import re

def parse_and_format_date(val):
    if pd.isna(val) or str(val).strip() == '':
        return ''
    val_str = str(val).strip()
    if re.match(r'^\\d+(\\.\\d+)?$', val_str):
        try:
            num = int(float(val_str))
            if 30000 < num < 60000:
                dt = pd.to_datetime(num, unit='D', origin='1899-12-30')
                return dt.strftime('%d-%m-%y')
        except Exception:
            pass
    try:
        dt = pd.to_datetime(val_str, errors='coerce', dayfirst=True)
        if pd.notna(dt):
            return dt.strftime('%d-%m-%y')
    except Exception:
        pass
    return val_str


# Load look up paths (relative to scratch_cleaning folder)
sales_lookup_path = "../Sales_lookup.csv"
item_lookup_path = "../Item_lookup_sales.csv"
item_cat_update_path = "../Item_Cat_Update  saless.csv"
item_cat_sales_update_path = "../Item_Cat_Sales_Update (1).xlsx"
sales_person_lookup_path = "../Sales_lookup_person.csv"
sales_person_mapped_path = "../Sales person mapped to biz. vertical.csv"

def find_and_rename_col(df, target_name, variations):
    for col in df.columns:
        if col.strip().lower() in [v.lower().strip() for v in variations]:
            df.rename(columns={col: target_name}, inplace=True)
            return target_name
    return None

if os.path.exists("raw_sales.csv"):
    sales_df = pd.read_csv("raw_sales.csv")
    print(f"Loaded {sales_df.shape[0]} raw sales rows.")
    
    # Strip whitespace from headers first
    sales_df.columns = [c.strip() for c in sales_df.columns]
    
    # Resolve columns case-insensitively
    find_and_rename_col(sales_df, 'Customer Name', ['Customer Name', 'customer_name', 'customer', 'party_name', 'party name'])
    find_and_rename_col(sales_df, 'Invoice Number', ['Invoice Number', 'invoice_number', 'invoice number', 'invoice #'])
    find_and_rename_col(sales_df, 'Invoice Date', ['Invoice Date', 'invoice_date', 'date'])
    find_and_rename_col(sales_df, 'Item Total', ['Item Total', 'item_total', 'total', 'item amount'])
    find_and_rename_col(sales_df, 'Balance', ['Balance', 'balance'])
    find_and_rename_col(sales_df, 'Invoice Status', ['Invoice Status', 'invoice_status', 'status'])
    find_and_rename_col(sales_df, 'CF.Business Verticals', ['CF.Business Verticals', 'business_verticals', 'business vertical'])
    find_and_rename_col(sales_df, 'Division', ['Division', 'division'])
    find_and_rename_col(sales_df, 'Sales person', ['Sales person', 'sales_person', 'salesperson'])
    find_and_rename_col(sales_df, 'Item Name', ['Item Name', 'item_name', 'item'])
    find_and_rename_col(sales_df, 'Item Desc', ['Item Desc', 'item_description', 'description'])
    find_and_rename_col(sales_df, 'Due Date', ['Due Date', 'due_date', 'due date'])
    find_and_rename_col(sales_df, 'Last Payment Date', ['Last Payment Date', 'last_payment_date', 'last payment date'])
    find_and_rename_col(sales_df, 'Place of Supply(With State Code)', ['Place of Supply(With State Code)', 'place_of_supply_state_code', 'place_of_supply'])
    find_and_rename_col(sales_df, 'GST Treatment', ['GST Treatment', 'gst_treatment', 'gst treatment'])
    find_and_rename_col(sales_df, 'Payment Terms Label', ['Payment Terms Label', 'payment_terms_label', 'payment terms label'])
    find_and_rename_col(sales_df, 'Location Name', ['Location Name', 'location_name', 'location name'])
    find_and_rename_col(sales_df, 'Quantity', ['Quantity', 'quantity', 'qty'])
    find_and_rename_col(sales_df, 'Item Type', ['Item Type', 'item_type', 'item type'])
    find_and_rename_col(sales_df, 'Supply Type', ['Supply Type', 'supply_type', 'supply type'])
    find_and_rename_col(sales_df, 'Item Tax', ['Item Tax', 'item_tax', 'item tax'])
    find_and_rename_col(sales_df, 'Item Tax Amount', ['Item Tax Amount', 'item_tax_amount', 'item tax amount'])
    find_and_rename_col(sales_df, 'Supplier City', ['Supplier City', 'supplier_city', 'supplier city'])
    find_and_rename_col(sales_df, 'Item Price', ['Item Price', 'item_price', 'item price'])
    find_and_rename_col(sales_df, 'Billing City', ['Billing City', 'billing_city', 'billing city'])
    find_and_rename_col(sales_df, 'Billing State', ['Billing State', 'billing_state', 'billing state'])
    find_and_rename_col(sales_df, 'Shipping City', ['Shipping City', 'shipping_city', 'shipping city'])
    find_and_rename_col(sales_df, 'Shipping State', ['Shipping State', 'shipping_state', 'shipping state'])
    
    # Step 1: Lineage Tracking
    if 'source_file' not in sales_df.columns:
        sales_df['source_file'] = 'raw_sales.csv'
    if 'source_sheet' not in sales_df.columns:
        sales_df['source_sheet'] = 'Sheet1'

    # Step 2: Feature Lookup & Structural Alignment
    # Fill empty values of item name with item desc
    if 'Item Name' in sales_df.columns and 'Item Desc' in sales_df.columns:
        sales_df['Item Name'] = sales_df['Item Name'].fillna(sales_df['Item Desc'])
        print("Filled empty Item Name with Item Desc.")
    
    # Dynamic Column Pruning
    if os.path.exists(sales_lookup_path):
        look_up_df = pd.read_csv(sales_lookup_path)
        columns_to_keep = look_up_df[look_up_df.columns[0]].tolist()
        columns_to_keep = [c.strip() for c in columns_to_keep]
        # Include lineage trackers
        target_columns = columns_to_keep + ['source_file', 'source_sheet']
        cols_to_keep_lower = [c.lower() for c in target_columns]
        cols_to_drop = []
        for col in sales_df.columns:
            if col.lower().strip() not in cols_to_keep_lower:
                cols_to_drop.append(col)
        sales_df.drop(columns=cols_to_drop, inplace=True, errors='ignore')
        print(f"Columns remaining: {sales_df.columns.tolist()}")
    else:
        print("Warning: Sales_lookup.csv not found, skipping column drop.")
        
    # Step 3: Transactional Filters & Domain Cleansing
    # Drop JV and DN invoices
    if 'Invoice Number' in sales_df.columns:
        initial_shape = sales_df.shape[0]
        sales_df = sales_df[~sales_df['Invoice Number'].astype(str).str.contains('JV|DN', na=False, case=False)].copy()
        print(f"Dropped JV and DN invoices: {initial_shape} -> {sales_df.shape[0]} rows.")
        
    # Fill null values in CF.Business Verticals with values of Division column
    if 'CF.Business Verticals' in sales_df.columns and 'Division' in sales_df.columns:
        sales_df['CF.Business Verticals'] = sales_df['CF.Business Verticals'].fillna(sales_df['Division'])
        
    # Read salesperson lookup and apply ewaste condition check if lookup exists
    if os.path.exists(sales_person_lookup_path):
        sales_person_df = pd.read_csv(sales_person_lookup_path)
        div_vals = sales_df['Division'] if 'Division' in sales_df.columns else pd.Series([np.nan]*len(sales_df))
        bv_vals = sales_df['CF.Business Verticals'] if 'CF.Business Verticals' in sales_df.columns else pd.Series([np.nan]*len(sales_df))
        sp_vals = sales_df['Sales person'] if 'Sales person' in sales_df.columns else pd.Series([np.nan]*len(sales_df))
        
        sp_col_name = 'Sales person' if 'Sales person' in sales_person_df.columns else sales_person_df.columns[0]
        condition = (
            (div_vals.isin(['Ewaste']) | div_vals.isnull()) &
            (bv_vals.isin(['Ewaste']) | bv_vals.isnull()) &
            (sp_vals.isin(sales_person_df[sp_col_name]))
        )
        if 'CF.Business Verticals' in sales_df.columns:
            sales_df.loc[condition, 'CF.Business Verticals'] = 'Ewaste'
            print("Applied salesperson ewaste mapping condition.")
            
    # Void Invoice Status means internally cancelled
    if 'Invoice Status' in sales_df.columns:
        sales_df = sales_df[sales_df['Invoice Status'] != 'Void']
        
    sales_df.drop_duplicates(inplace=True)
    
    if 'CF.Business Verticals' in sales_df.columns:
        sales_df['CF.Business Verticals'] = sales_df['CF.Business Verticals'].replace('EWaste', 'Ewaste')
        
    # Step 4: Higher-Order Category Mapping
    # Item Category Mapping (First pass)
    if os.path.exists(item_cat_update_path) and 'Item Name' in sales_df.columns:
        df_lookup_group = pd.read_csv(item_cat_update_path)
        if 'Category' in df_lookup_group.columns:
            sales_df = sales_df.merge(df_lookup_group[['Item Name', 'Category']], on='Item Name', how='left')
            print("Merged categories from Item_Cat_Update saless.")
            
    # Drop rows where business vertical is null
    if 'CF.Business Verticals' in sales_df.columns:
        sales_df = sales_df.dropna(subset=['CF.Business Verticals'])
        
    # Fill categories (Second pass)
    if os.path.exists(item_cat_sales_update_path) and 'Category' in sales_df.columns and 'Item Name' in sales_df.columns:
        df_lookup_cat = pd.read_excel(item_cat_sales_update_path)
        item_col = 'Item' if 'Item' in df_lookup_cat.columns else df_lookup_cat.columns[0]
        cat_col = 'Category' if 'Category' in df_lookup_cat.columns else df_lookup_cat.columns[1]
        
        category_map = df_lookup_cat.drop_duplicates(subset=[item_col], keep='first').set_index(item_col)[cat_col]
        sales_df['Category'] = sales_df['Category'].fillna(sales_df['Item Name'].map(category_map))
        print("Filled missing categories from Item_Cat_Sales_Update.")
        
    # Drop rows where category is null
    if 'Category' in sales_df.columns:
        sales_df = sales_df.dropna(subset=['Category'])
        
    # Sales person mapping to business vertical if present (late mapping)
    if os.path.exists(sales_person_mapped_path) and 'Sales person' in sales_df.columns and 'CF.Business Verticals' in sales_df.columns:
        salesperson_df = pd.read_csv(sales_person_mapped_path)
        sp_name_col = 'salesperson_name' if 'salesperson_name' in salesperson_df.columns else salesperson_df.columns[0]
        sp_bv_col = 'invoice.CF.Business Verticals' if 'invoice.CF.Business Verticals' in salesperson_df.columns else salesperson_df.columns[1]
        
        condition = sales_df['Sales person'].isin(salesperson_df[sp_name_col]) & sales_df['CF.Business Verticals'].isnull()
        sp_map = salesperson_df.set_index(sp_name_col)[sp_bv_col].to_dict()
        sales_df.loc[condition, 'CF.Business Verticals'] = sales_df.loc[condition, 'Sales person'].map(sp_map)
        print("Applied salesperson business vertical mapping.")
        
    # Drop rows where business vertical is null
    if 'CF.Business Verticals' in sales_df.columns:
        sales_df = sales_df[sales_df['CF.Business Verticals'].notnull()]
        
    # Step 5: Descriptive Analytics & Customer Cohort Engineering
    # Temporal Trajectory Extraction
    if 'Invoice Date' in sales_df.columns:
        sales_df['Invoice Date_dt'] = pd.to_datetime(sales_df['Invoice Date'], errors='coerce')
        sales_df['Invoice Year'] = sales_df['Invoice Date_dt'].dt.year
        sales_df['Invoice Month'] = sales_df['Invoice Date_dt'].dt.month
        sales_df['Invoice Quarter'] = sales_df['Invoice Date_dt'].dt.to_period('Q')
        
    if 'Last Payment Date' in sales_df.columns and 'Due Date' in sales_df.columns:
        lp_dt = pd.to_datetime(sales_df['Last Payment Date'], errors='coerce')
        due_dt = pd.to_datetime(sales_df['Due Date'], errors='coerce')
        sales_df['Payment Delay'] = (lp_dt - due_dt).dt.days.fillna(0)
        
    # Chronological Composition Tracking
    if 'Customer Name' in sales_df.columns and 'Invoice Year' in sales_df.columns:
        sales_df['Entry Year'] = sales_df.groupby('Customer Name')['Invoice Year'].transform('min')
        
    # Step 6: Discrete Purchase Gap Analysis
    # Time-Series Discretization & Offset Shifting
    if 'Customer Name' in sales_df.columns and 'Invoice Date_dt' in sales_df.columns:
        sales_df['Period'] = sales_df['Invoice Date_dt'].dt.to_period('Q')
        sales_df['Quarter'] = sales_df['Period'].astype(str)
        
        cust_quarters = sales_df[['Customer Name', 'Period']].drop_duplicates().sort_values(['Customer Name', 'Period'])
        cust_quarters['Prev_Period'] = cust_quarters.groupby('Customer Name')['Period'].shift(1)
        cust_quarters['Gap (quarters)'] = cust_quarters.apply(
            lambda r: (r['Period'] - r['Prev_Period']).n if pd.notna(r['Prev_Period']) else np.nan, axis=1
        )
        sales_df = sales_df.merge(cust_quarters[['Customer Name', 'Period', 'Gap (quarters)']], on=['Customer Name', 'Period'], how='left')
    else:
        sales_df['Quarter'] = ''
        sales_df['Gap (quarters)'] = np.nan
        
    # Step 7: Recency State Panel & Transition Probability Matrix (TPM)
    if 'Customer Name' in sales_df.columns and 'Invoice Date_dt' in sales_df.columns:
        min_q = sales_df['Period'].min()
        max_q = sales_df['Period'].max()
        if pd.notna(min_q) and pd.notna(max_q):
            customer_entries = sales_df.groupby('Customer Name')['Period'].min()
            panel_rows = []
            for cust, entry_q in customer_entries.items():
                cust_qs = pd.period_range(entry_q, max_q, freq='Q')
                for q in cust_qs:
                    panel_rows.append({'Customer Name': cust, 'Period': q})
            panel_df = pd.DataFrame(panel_rows)
            
            purchase_set = set(zip(sales_df['Customer Name'], sales_df['Period']))
            panel_df['Purchased'] = panel_df.apply(lambda r: (r['Customer Name'], r['Period']) in purchase_set, axis=1)
            
            recency_states = []
            for cust, group in panel_df.groupby('Customer Name'):
                group = group.sort_values('Period')
                current_state = 1
                states = []
                for idx, row in group.iterrows():
                    if row['Purchased']:
                        current_state = 1
                    else:
                        current_state = min(current_state + 1, 5)
                    states.append(current_state)
                group['Recency State'] = states
                recency_states.append(group)
                
            panel_df = pd.concat(recency_states)
            sales_df = sales_df.merge(panel_df[['Customer Name', 'Period', 'Recency State']], on=['Customer Name', 'Period'], how='left')
        else:
            sales_df['Recency State'] = np.nan
    else:
        sales_df['Recency State'] = np.nan

    # Step 8: Monetary Bracket Segmentation
    if 'Customer Name' in sales_df.columns and 'Period' in sales_df.columns and 'Item Total' in sales_df.columns:
        sales_df['Item Total'] = pd.to_numeric(sales_df['Item Total'], errors='coerce').fillna(0)
        cust_q_spend = sales_df.groupby(['Customer Name', 'Period'])['Item Total'].sum().reset_index(name='Quarterly Spend')
        
        def assign_monetary_segment(spend):
            if spend < 500:
                return 'Low Value Tier'
            elif spend < 5000:
                return 'Core Core-Retail Tier'
            elif spend < 50000:
                return 'Mid-Market Commercial Tier'
            else:
                return 'Enterprise Major Tier'

        cust_q_spend['Monetary Segment'] = cust_q_spend['Quarterly Spend'].apply(assign_monetary_segment)
        sales_df = sales_df.merge(cust_q_spend[['Customer Name', 'Period', 'Monetary Segment']], on=['Customer Name', 'Period'], how='left')
    else:
        sales_df['Monetary Segment'] = ''

    # Final target columns mapping
    target_cols = [
        'source_file', 'source_sheet', 'Invoice Date', 'Invoice Number', 'Invoice Status',
        'Customer Name', 'Place of Supply(With State Code)', 'GST Treatment', 'Due Date',
        'Payment Terms Label', 'Location Name', 'Item Name', 'Quantity', 'Item Total',
        'Sales person', 'Item Type', 'Supply Type', 'Item Tax', 'Item Tax Amount',
        'CF.Business Verticals', 'Last Payment Date', 'Supplier City', 'Item Price',
        'Division', 'Billing City', 'Billing State', 'Shipping City', 'Shipping State',
        'Category', 'Payment Delay', 'Entry Year', 'Quarter', 'Gap (quarters)',
        'Recency State', 'Monetary Segment'
    ]
    for col in target_cols:
        if col not in sales_df.columns:
            sales_df[col] = ''
            
    # Format date columns to dd-mm-yy at the end
    for col in ['Invoice Date', 'Due Date', 'Last Payment Date']:
        if col in sales_df.columns:
            sales_df[col] = sales_df[col].apply(parse_and_format_date)
            
    sales_df = sales_df[target_cols]
    sales_df.to_csv("sales_clean.csv", index=False)
    print(f"Data imputation complete. Cleaned sales data saved. Shape: {sales_df.shape}")
else:
    print("raw_sales.csv not found!")
`;

const DEFAULT_PURCHASE_PY = `import os
import pandas as pd
import numpy as np
import re

def parse_and_format_date(val):
    if pd.isna(val) or str(val).strip() == '':
        return ''
    val_str = str(val).strip()
    if re.match(r'^\\d+(\\.\\d+)?$', val_str):
        try:
            num = int(float(val_str))
            if 30000 < num < 60000:
                dt = pd.to_datetime(num, unit='D', origin='1899-12-30')
                return dt.strftime('%d-%m-%y')
        except Exception:
            pass
    try:
        dt = pd.to_datetime(val_str, errors='coerce', dayfirst=True)
        if pd.notna(dt):
            return dt.strftime('%d-%m-%y')
    except Exception:
        pass
    return val_str


# Load look up paths (relative to scratch_cleaning folder)
item_details_lookup_path = "../item_details_lookup_purchase.csv"
lookup_items_path = "../Lookup_items.xls"
lookup_items_csv_path = "../Lookup_items.csv"
purchase_items_lookup_cat_path = "../Purchase_Items_Lookup_Category.csv"
vendors_status_path = "../Vendors_Status.csv"

def find_and_rename_col(df, target_name, variations):
    for col in df.columns:
        if col.strip().lower() in [v.lower().strip() for v in variations]:
            df.rename(columns={col: target_name}, inplace=True)
            return target_name
    return None

if os.path.exists("raw_purchase.csv"):
    purchase_df = pd.read_csv("raw_purchase.csv")
    print(f"Loaded {purchase_df.shape[0]} raw purchase rows.")
    
    # Strip whitespace from headers first
    purchase_df.columns = [c.strip() for c in purchase_df.columns]
    
    # Resolve columns case-insensitively
    find_and_rename_col(purchase_df, 'Vendor Name', ['Vendor Name', 'vendor_name', 'vendor'])
    find_and_rename_col(purchase_df, 'Invoice Status', ['Invoice Status', 'invoice_status', 'status'])
    find_and_rename_col(purchase_df, 'Submission Date', ['Submission Date', 'submission_date', 'date', 'invoice date'])
    find_and_rename_col(purchase_df, 'Total Amount', ['Total Amount', 'total_amount', 'total', 'amount'])
    find_and_rename_col(purchase_df, 'Business Vertical', ['Business Vertical', 'business_vertical', 'vertical'])
    find_and_rename_col(purchase_df, 'Division', ['Division', 'division'])
    find_and_rename_col(purchase_df, 'Expense Type', ['Expense Type', 'expense_type', 'expense'])
    find_and_rename_col(purchase_df, 'Item Name', ['Item Name', 'item_name', 'item'])
    find_and_rename_col(purchase_df, 'Quantity', ['Quantity', 'quantity', 'qty'])
    find_and_rename_col(purchase_df, 'Rate per unit', ['Rate per unit', 'rate_per_unit', 'rate'])
    find_and_rename_col(purchase_df, 'Details', ['Details', 'details', 'item details'])
    find_and_rename_col(purchase_df, 'Invoice #', ['Invoice #', 'invoice_number', 'invoice number', 'bill #', 'bill_number', 'bill number'])
    find_and_rename_col(purchase_df, 'Debit Note', ['Debit Note', 'debit_note', 'debit note'])
    find_and_rename_col(purchase_df, 'Rejection Comments', ['Rejection Comments', 'rejection_comments', 'rejection comment'])
    find_and_rename_col(purchase_df, 'Payment Date', ['Payment Date', 'payment_date', 'payment date'])
    find_and_rename_col(purchase_df, 'Booking status (For Accounts only)', ['Booking status (For Accounts only)', 'booking_status'])
    find_and_rename_col(purchase_df, 'Balance', ['Balance', 'balance'])
    find_and_rename_col(purchase_df, 'Sum of Base Amount', ['Sum of Base Amount', 'sum_of_base_amount', 'base_amount'])
    find_and_rename_col(purchase_df, 'Sum of Total Amount', ['Sum of Total Amount', 'sum_of_total_amount', 'sum_total_amount'])
    find_and_rename_col(purchase_df, 'Vendor Code', ['Vendor Code', 'vendor_code', 'vendor code'])
    
    # Step 1: Initial Missing Value Check
    print("Initial Missing Value Check:")
    print(purchase_df.isnull().sum())
    
    # Step 2: Business Vertical Imputation (Division)
    if 'Business Vertical' in purchase_df.columns and 'Division' in purchase_df.columns:
        purchase_df['Business Vertical'] = purchase_df['Business Vertical'].fillna(purchase_df['Division'])
        
    # Step 3: Business Vertical Standardization (EPR)
    if 'Business Vertical' in purchase_df.columns:
        purchase_df.loc[purchase_df['Business Vertical'] == 'EPR', 'Business Vertical'] = 'Plastic Operations'
        
    # Step 4: Business Vertical Filtering
    if 'Business Vertical' in purchase_df.columns:
        purchase_df = purchase_df[~purchase_df['Business Vertical'].isin(['Admin', 'IT', 'Social Inclusion', 'PRF Job Work', 'QEHS', 'Marketing', 'General'])]
        
    # Step 5: Business Vertical Standardization (ZWP-Sales)
    if 'Business Vertical' in purchase_df.columns:
        purchase_df.loc[purchase_df['Business Vertical'] == 'ZWP-Sales', 'Business Vertical'] = 'ZWP Sales'
        
    # Step 6: Business Vertical Standardization (Ewaste spellings check)
    try:
        from thefuzz import process
        has_fuzz = True
    except ImportError:
        has_fuzz = False

    def standardize_ewaste(val):
        if pd.isna(val): return val
        val_str = str(val).strip().lower()
        if val_str in ['ewaste', 'e-waste', 'refurbishment', 'ewaste ', 'e waste']:
            return "Ewaste"
        if has_fuzz:
            match = process.extractOne(str(val), ["Ewaste"])
            if match and match[1] > 80:
                return "Ewaste"
        return val

    if 'Business Vertical' in purchase_df.columns:
        purchase_df['Business Vertical'] = purchase_df['Business Vertical'].apply(standardize_ewaste)
        print("Standardized Business Verticals (Ewaste).")
        
    # Step 7: Drop Missing Vendor Names
    purchase_df = purchase_df.dropna(subset=['Vendor Name'])
    
    # Step 8: Expense Type Imputation
    if 'Expense Type' in purchase_df.columns:
        purchase_df['Expense Type'] = purchase_df['Expense Type'].fillna('Blanks Expense')
        
    # Step 9: Invoice Status Imputation (Rejection Comments)
    if 'Invoice Status' in purchase_df.columns:
        rejection_comments_notnull = purchase_df['Rejection Comments'].notnull() if 'Rejection Comments' in purchase_df.columns else pd.Series([False]*len(purchase_df))
        purchase_df.loc[rejection_comments_notnull & purchase_df['Invoice Status'].isnull(), 'Invoice Status'] = 'Rejected Invoices'
        
        # Step 10: Invoice Status Imputation (Payment Date / Booking Status)
        pay_date_notnull = purchase_df['Payment Date'].notnull() if 'Payment Date' in purchase_df.columns else pd.Series([False]*len(purchase_df))
        booking_booked = (purchase_df['Booking status (For Accounts only)'] == 'Booked') if 'Booking status (For Accounts only)' in purchase_df.columns else pd.Series([False]*len(purchase_df))
        purchase_df.loc[((pay_date_notnull | booking_booked) & (purchase_df['Invoice Status'].isnull())), 'Invoice Status'] = 'Full Paid Invoices'
        
        # Step 11: Invoice Status Imputation (Balance)
        bal_vals = purchase_df['Balance'] if 'Balance' in purchase_df.columns else pd.Series([np.nan]*len(purchase_df))
        purchase_df.loc[((bal_vals == 0) | (bal_vals.isnull())) & (purchase_df['Invoice Status'].isnull()), 'Invoice Status'] = 'Full Paid Invoices'
        
    # Step 12: Debit Note Imputation
    if 'Invoice Status' in purchase_df.columns and 'Debit Note' in purchase_df.columns:
        purchase_df.loc[purchase_df['Invoice Status'] == 'Full Paid Invoices', 'Debit Note'] = purchase_df.loc[purchase_df['Invoice Status'] == 'Full Paid Invoices', 'Debit Note'].fillna(0)
        
    # Step 13: Column Dropping (dropped at the end mapping to keep logic parameters)
    drop_cols = ['Finance Comments', 'Rejection Comments', 'Credit Note', 'Balance', 'Approved date by Lead',
                 'Payment Type', 'Document Type', 'Payment Due on', 'Payment Date', 'Any Special Requests', 'Transaction No']
    purchase_df.drop(columns=[c for c in drop_cols if c in purchase_df.columns], inplace=True, errors='ignore')
    
    df_reordered = purchase_df.copy()
    
    # Step 14: Details Column Standardization using lookup
    if os.path.exists(item_details_lookup_path) and 'Details' in df_reordered.columns:
        item_details_lookup_df = pd.read_csv(item_details_lookup_path)
        orig_col = 'Original' if 'Original' in item_details_lookup_df.columns else ('Details_lookup' if 'Details_lookup' in item_details_lookup_df.columns else item_details_lookup_df.columns[0])
        ref_col = 'Refined' if 'Refined' in item_details_lookup_df.columns else ('Details Refined' if 'Details Refined' in item_details_lookup_df.columns else item_details_lookup_df.columns[1])
        
        for index, row in item_details_lookup_df.iterrows():
            df_reordered.loc[df_reordered['Details'] == row[orig_col], 'Details'] = row[ref_col]
            
    # Step 15: Details Column Splitting
    if 'Details' in df_reordered.columns:
        df_reordered['Details'] = df_reordered['Details'].astype(str).str.replace('FY 20-21', 'FY 20_21')
        df_reordered = df_reordered.assign(Details=df_reordered['Details'].str.split(',')) \
                       .explode('Details')
        df_reordered['Details'] = df_reordered['Details'].str.strip().fillna('')
        
        def smart_split(s):
            parts = re.split(r'-(?=\\d)', str(s))
            return parts
            
        split_cols = df_reordered['Details'].apply(lambda x: pd.Series(smart_split(x)))
        split_cols.columns = [f"Part{i+1}" for i in range(split_cols.shape[1])]
        df_final = pd.concat([df_reordered, split_cols], axis=1)
        
        rename_parts = {'Part1': 'Item Name', 'Part2': 'Rate per unit', 'Part3': 'Quantity', 'Part4': 'Total Amount'}
        for old_p, new_p in rename_parts.items():
            if old_p in df_final.columns:
                df_final.rename(columns={old_p: new_p}, inplace=True)
    else:
        df_final = df_reordered
        
    df_updated = df_final.copy()
    
    # Step 16: Business Vertical Reclassification (Refurbishment)
    df_lookup = None
    if os.path.exists(lookup_items_path):
        df_lookup = pd.read_excel(lookup_items_path)
    elif os.path.exists(lookup_items_csv_path):
        df_lookup = pd.read_csv(lookup_items_csv_path)
        
    if df_lookup is not None and 'Vendor Name' in df_updated.columns and 'Item Name' in df_updated.columns:
        vendor_col = 'Vendor Name' if 'Vendor Name' in df_lookup.columns else df_lookup.columns[0]
        item_col = 'Item_Name' if 'Item_Name' in df_lookup.columns else ('Item Name' if 'Item Name' in df_lookup.columns else df_lookup.columns[1])
        
        for index, row in df_updated.iterrows():
            vendor_val = row['Vendor Name']
            item_val = row['Item Name']
            if not pd.isna(vendor_val) and not pd.isna(item_val):
                match_rows = df_lookup[(df_lookup[vendor_col] == vendor_val) & (df_lookup[item_col] == item_val)]
                if len(match_rows) > 0:
                    df_updated.at[index, 'Business Vertical'] = 'Refurbishment'
                    
    # Step 17: Drop Rows with Critical Missing Values
    df_updated = df_updated.dropna(subset=[c for c in ['Vendor Name', 'Item Name', 'Submission Date'] if c in df_updated.columns], how='any')
    
    # Step 18: Drop Vendor Code
    df_updated.drop(['Vendor Code'], axis=1, inplace=True, errors='ignore')
    
    # Step 19: Total Amount Imputation
    if 'Total Amount' in df_updated.columns and 'Sum of Base Amount' in df_updated.columns and 'Item Name' in df_updated.columns and 'Details' in df_updated.columns:
        df_updated['Total Amount'] = pd.to_numeric(df_updated['Total Amount'], errors='coerce')
        df_updated['Sum of Base Amount'] = pd.to_numeric(df_updated['Sum of Base Amount'], errors='coerce')
        details_match = df_updated['Item Name'].astype(str).str.strip() == df_updated['Details'].astype(str).str.strip()
        condition = (df_updated['Total Amount'].isnull() | (df_updated['Total Amount'] == 0)) & details_match & df_updated['Sum of Base Amount'].notnull()
        df_updated.loc[condition, 'Total Amount'] = df_updated.loc[condition, 'Sum of Base Amount']
        
    # Step 20 & 21: Filter Out Specific MRF and Vendor Entries
    if 'Business Vertical' in df_updated.columns and 'Invoice Status' in df_updated.columns and 'Rate per unit' in df_updated.columns and 'Total Amount' in df_updated.columns:
        df_updated['Rate per unit'] = pd.to_numeric(df_updated['Rate per unit'], errors='coerce').fillna(0)
        df_updated['Total Amount'] = pd.to_numeric(df_updated['Total Amount'], errors='coerce').fillna(0)
        df_updated = df_updated[
            ~((df_updated['Business Vertical'].isin(['MRF'])) &
              (df_updated['Invoice Status'] == 'Full Paid Invoices') &
              (df_updated['Rate per unit'] == 0) &
              (df_updated['Total Amount'] == 0))
        ]
        df_updated = df_updated[
            ~((df_updated['Vendor Name'] == 'Shri Muneswara Swami Prasanna') &
              (df_updated['Invoice Status'] == 'Full Paid Invoices') &
              (df_updated['Rate per unit'] == 0) &
              (df_updated['Total Amount'] == 0))
        ]
        
    # Step 22: Rate per Unit Calculation
    if 'Total Amount' in df_updated.columns and 'Quantity' in df_updated.columns and 'Rate per unit' in df_updated.columns:
        df_updated['Quantity'] = pd.to_numeric(df_updated['Quantity'], errors='coerce')
        condition = (df_updated['Rate per unit'] == 0) & (df_updated['Quantity'] != 0) & (df_updated['Quantity'].notnull())
        df_updated.loc[condition, 'Rate per unit'] = df_updated.loc[condition, 'Total Amount'] / df_updated.loc[condition, 'Quantity']
        
    # Step 23: Total Amount Adjustment (GST Purchases)
    if 'Invoice Status' in df_updated.columns and 'Expense Type' in df_updated.columns and 'Item Name' in df_updated.columns and 'Sum of Total Amount' in df_updated.columns:
        df_updated['Sum of Total Amount'] = pd.to_numeric(df_updated['Sum of Total Amount'], errors='coerce')
        condition = (
            (df_updated['Invoice Status'] == 'Full Paid Invoices') &
            (df_updated['Expense Type'] == 'GST Purchases') &
            (df_updated['Item Name'].isin(['CEEW1 - LED', 'LCD'])) &
            (df_updated['Sum of Total Amount'].notna())
        )
        df_updated.loc[condition, 'Total Amount'] = df_updated.loc[condition, 'Sum of Total Amount'] / 1.18
        
    # Step 24: Item Deletion
    if os.path.exists(purchase_items_lookup_cat_path) and 'Item Name' in df_updated.columns:
        df_lookup_group = pd.read_csv(purchase_items_lookup_cat_path)
        if 'Delete' in df_lookup_group.columns:
            items_to_delete = df_lookup_group[df_lookup_group['Delete'].notna()]['Item Name']
            df_updated = df_updated[~df_updated['Item Name'].isin(items_to_delete)]
                
    # Step 25: Hierarchical Median Imputation (Rate per unit & Quantity)
    if 'Invoice Status' in df_updated.columns and 'Rate per unit' in df_updated.columns and 'Quantity' in df_updated.columns:
        df_fp = df_updated[df_updated['Invoice Status'] == 'Full Paid Invoices']
        if len(df_fp) > 0:
            rate_lvl1 = df_fp.groupby(['Business Vertical', 'Item Name'])['Rate per unit'].median()
            rate_lvl2 = df_fp.groupby('Business Vertical')['Rate per unit'].median()
            rate_global = df_fp['Rate per unit'].median()
            
            mask_rate = (df_updated['Invoice Status'] == 'Full Paid Invoices') & (df_updated['Rate per unit'].isna())
            df_updated.loc[mask_rate, 'Rate per unit'] = df_updated.loc[mask_rate].set_index(['Business Vertical', 'Item Name']).index.map(rate_lvl1)
            df_updated.loc[mask_rate & df_updated['Rate per unit'].isna(), 'Rate per unit'] = df_updated.loc[mask_rate & df_updated['Rate per unit'].isna(), 'Business Vertical'].map(rate_lvl2)
            df_updated.loc[mask_rate & df_updated['Rate per unit'].isna(), 'Rate per unit'] = rate_global
            
            qty_lvl1 = df_fp.groupby(['Business Vertical', 'Item Name'])['Quantity'].median()
            qty_lvl2 = df_fp.groupby('Business Vertical')['Quantity'].median()
            qty_global = df_fp['Quantity'].median()
            
            mask_qty = (df_updated['Invoice Status'] == 'Full Paid Invoices') & (df_updated['Quantity'].isna())
            df_updated.loc[mask_qty, 'Quantity'] = df_updated.loc[mask_qty].set_index(['Business Vertical', 'Item Name']).index.map(qty_lvl1)
            df_updated.loc[mask_qty & df_updated['Quantity'].isna(), 'Quantity'] = df_updated.loc[mask_qty & df_updated['Quantity'].isna(), 'Business Vertical'].map(qty_lvl2)
            df_updated.loc[mask_qty & df_updated['Quantity'].isna(), 'Quantity'] = qty_global
            
            # Step 26: Recalculate Total Amount
            df_updated['Total Amount'] = df_updated['Rate per unit'] * df_updated['Quantity']
            
    # Step 27: Filter by Expense Type
    if 'Expense Type' in df_updated.columns:
        valid_expense_types = [
            'GST Purchases', 'Operations-Transpotation Charges', 'Purchases from Unregistered dealer',
            'Consumables', 'Professional Service Fees', 'Admin-Professional & Consultancy Charges',
            'Scrap Handling & Transporatation', 'Office Stationary and Consumables', 'Operation A - PPE and Consumables',
            'Consultants-Sales, BD, cRM', 'Operations-Rejects/ Wet Waste Collection', 'Operations-Stationary N Printing',
            'Raw Materials', 'Auditing and Company Sec Charges', 'Website Development Charges',
            'Operations Communication Expenses', 'Operation-Shredding & Baling Charges', 'Blank Expense', 'Blanks Expense'
        ]
        df_updated = df_updated[df_updated['Expense Type'].isin(valid_expense_types)]
        
    # Step 28: Category Imputation
    if os.path.exists(purchase_items_lookup_cat_path) and 'Item Name' in df_updated.columns:
        df_lookup_group = pd.read_csv(purchase_items_lookup_cat_path)
        if 'Category' in df_lookup_group.columns:
            df_updated = df_updated.merge(df_lookup_group[['Item Name', 'Category']], on='Item Name', how='left')
            
    if 'Category' in df_updated.columns and 'Item Name' in df_updated.columns:
        df_updated.loc[df_updated['Item Name'].str.contains('Redenim', case=False, na=False) & (df_updated['Category'].isna() | (df_updated['Category'] == '')), 'Category'] = 'Bags'
        df_updated.loc[df_updated['Item Name'].str.contains('Sarvam', case=False, na=False) & (df_updated['Category'].isna() | (df_updated['Category'] == '')), 'Category'] = 'Others'
        df_updated.loc[df_updated['Item Name'].str.contains('Milestone', case=False, na=False) & (df_updated['Category'].isna() | (df_updated['Category'] == '')), 'Category'] = 'IT'
        
        # Step 29: Drop Missing Categories
        df_updated = df_updated.dropna(subset=['Category'])
        
    # Step 30: Remove Duplicate Rows
    df_updated = df_updated.drop_duplicates()
    
    # Step 31 & 32 & 37: Lookup Table Standardization, Consolidation & City Imputation
    if os.path.exists(vendors_status_path) and 'Vendor Name' in df_updated.columns:
        lookupdb = pd.read_csv(vendors_status_path)
        lookupdb.loc[lookupdb['Vendor Status'] == 'Vendor Registered', 'Vendor Status'] = 'Vendor Registered.'
        lookupdb.loc[lookupdb['Type'] == 'Unregistered Business', 'Type'] = 'Unregistered'
        lookupdb.loc[lookupdb['Type'].isin(['Registered Business - Regular', 'Registered Business - Composition', 'Registered Business']), 'Type'] = 'Registered'
        
        duplicate_vendors = lookupdb[lookupdb.duplicated(subset=['Vendor Name'], keep=False)]
        lookupdb = lookupdb.drop_duplicates(subset=['Vendor Name'], keep=False)
        lookupdb_clean = lookupdb[['Vendor Name', 'GST Identification Number (GSTIN)', 'Vendor Status', 'Type', 'City']]
        
        valid_status = ["Vendor Validated.", "Vendor Registered.", "SZW POC Verified."]
        valid_vendors = duplicate_vendors.loc[duplicate_vendors['Vendor Status'].isin(valid_status), 'Vendor Name'].unique()
        df_filtered = duplicate_vendors[
            (~duplicate_vendors['Vendor Name'].isin(valid_vendors)) |
            ((duplicate_vendors['Vendor Name'].isin(valid_vendors)) & (duplicate_vendors['Vendor Status'].isin(valid_status)))
        ]
        df_filtered = df_filtered[['Vendor Name', 'GST Identification Number (GSTIN)', 'Vendor Status', 'Type', 'City']]
        df_filtered = df_filtered.drop_duplicates(subset=['Vendor Name'], keep='first')
        
        lookupdb = pd.concat([lookupdb_clean, df_filtered])
        
        # Merge with suffixes to handle identical column names
        df_updated = df_updated.merge(
            lookupdb[['Vendor Name', 'GST Identification Number (GSTIN)', 'Vendor Status', 'Type', 'City']],
            on='Vendor Name',
            how='left',
            suffixes=('', '_lookup')
        )
        
        # Consolidate overlapping fields
        for c in ['GST Identification Number (GSTIN)', 'Vendor Status', 'Type', 'City']:
            lookup_col = f"{c}_lookup"
            if lookup_col in df_updated.columns:
                df_updated[c] = df_updated[c].fillna(df_updated[lookup_col]).replace(r'^\\s*$', np.nan, regex=True).fillna(df_updated[lookup_col])
                df_updated.drop(columns=[lookup_col], inplace=True, errors='ignore')
        
        # Step 33: Filter Out Rejected Invoices
        if 'Invoice Status' in df_updated.columns:
            df_updated = df_updated[df_updated['Invoice Status'] != 'Rejected Invoices']
            
        # Step 34: Filter Out Inactive Vendors
        if 'Vendor Status' in df_updated.columns:
            df_updated = df_updated[df_updated['Vendor Status'] != 'Vendor Inactive.']
            
        # Step 35: Compliance Status Imputation
        df_updated['Compliance Status'] = np.where(df_updated['GST Identification Number (GSTIN)'].notnull(), 'Compliant', None)
        df_updated.loc[(df_updated['Compliance Status'].isnull()) & (df_updated['Vendor Status'].isin(['Vendor Registered.', 'Vendor Validated.'])), 'Compliance Status'] = 'Compliant'
        df_updated.loc[((df_updated['Type'] == 'Registered') & (df_updated['Compliance Status'].isnull())), 'Compliance Status'] = 'Compliant'
        df_updated.loc[((df_updated['Type'] == 'Unregistered') & (df_updated['Compliance Status'].isnull())), 'Compliance Status'] = 'Non-compliant'
        if 'Expense Type' in df_updated.columns:
            df_updated.loc[df_updated['Expense Type'] == 'GST Purchases', 'Compliance Status'] = 'Compliant'
        df_updated.loc[df_updated['Compliance Status'].isnull(), 'Compliance Status'] = 'Non-compliant'
        
    # Step 36: Vendor Name Standardization (Casing and drop BESCOM/PUMA)
    if 'Vendor Name' in df_updated.columns:
        df_updated['Vendor Name'] = df_updated['Vendor Name'].astype(str).str.upper()
        df_updated = df_updated[~df_updated['Vendor Name'].str.contains('BESCOM|PUMA', na=False, case=False)]
        
    # Final target columns mapping
    target_cols = [
        'Invoice #', 'Vendor Name', 'Submission Date', 'Invoice Status', 'Debit Note',
        'Business Vertical', 'Division', 'Expense Type', 'Item Name', 'Rate per unit',
        'Quantity', 'Total Amount', 'Category', 'GST Identification Number (GSTIN)',
        'Vendor Status', 'Type', 'Compliance Status', 'City'
    ]
    for col in target_cols:
        if col not in df_updated.columns:
            df_updated[col] = ''
            
    # Format date columns to dd-mm-yy at the end
    for col in ['Submission Date']:
        if col in df_updated.columns:
            df_updated[col] = df_updated[col].apply(parse_and_format_date)
            
    df_updated = df_updated[target_cols]
    df_updated.to_csv("purchase_clean.csv", index=False)
    print(f"Cleaned purchase data saved to purchase_clean.csv successfully. Shape: {df_updated.shape}")
else:
    print("raw_purchase.csv not found!")
`;


export function ZohoModule() {
  const sync = useServerFn(syncZohoBooks);
  const pythonRun = useServerFn(runPythonCleaning);
  const loadLookups = useServerFn(loadCleaningLookups);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default to current fiscal year (Apr 1 → today)
  const today = new Date();
  const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const defaultFrom = `${fyStartYear}-04-01`;
  const defaultTo = today.toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);

  // Tab navigation state
  const [activeTab, setActiveTab] = useState("live");

  // Imputation module states
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [purchaseFile, setPurchaseFile] = useState<File | null>(null);
  const [salesRawData, setSalesRawData] = useState<any[] | null>(null);
  const [purchaseRawData, setPurchaseRawData] = useState<any[] | null>(null);
  const [salesCsvString, setSalesCsvString] = useState<string>("");
  const [purchaseCsvString, setPurchaseCsvString] = useState<string>("");
  
  const [engine, setEngine] = useState<"js" | "python">("js");
  const [salesScriptText, setSalesScriptText] = useState(DEFAULT_SALES_PY);
  const [purchaseScriptText, setPurchaseScriptText] = useState(DEFAULT_PURCHASE_PY);
  
  const [pipelineLogs, setPipelineLogs] = useState<LogLine[]>([]);
  const [pipelinePhase, setPipelinePhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [pipelineStats, setPipelineStats] = useState({
    salesRawCount: 0,
    salesCleanedCount: 0,
    salesImputedBalances: 0,
    purchaseRawCount: 0,
    purchaseCleanedCount: 0,
    purchaseImputedBalances: 0,
  });
  
  const [cleanedSales, setCleanedSales] = useState<any[] | null>(null);
  const [cleanedPurchase, setCleanedPurchase] = useState<any[] | null>(null);
  const [previewTab, setPreviewTab] = useState<"sales" | "purchase">("sales");
  const [editorTab, setEditorTab] = useState<"sales" | "purchase">("sales");

  const renderCell = (key: string, val: any) => {
    if (val === null || val === undefined || val === "") return "—";
    const lowerKey = key.toLowerCase();
    
    if (lowerKey.includes("date")) {
      return normalizeDate(val);
    }
    
    // Check for currency fields
    if (
      lowerKey.includes("total") ||
      lowerKey.includes("amount") ||
      lowerKey.includes("price") ||
      lowerKey.includes("balance") ||
      lowerKey.includes("rate") ||
      lowerKey.includes("debit note") ||
      lowerKey.includes("delay")
    ) {
      const num = Number(val);
      if (!isNaN(num)) {
        if (lowerKey.includes("delay")) return `${num} days`;
        return formatMoney(num);
      }
    }
    
    // Check for status fields
    if (lowerKey.includes("status") || lowerKey.includes("compliance")) {
      const s = String(val).toLowerCase();
      const isGood = s.includes("paid") || s.includes("compliant") || s.includes("validated") || s.includes("registered") || s.includes("verified");
      const isBad = s.includes("void") || s.includes("reject") || s.includes("non-compliant") || s.includes("inactive");
      const cls = isGood
        ? "bg-accent/10 text-accent-2 border-accent/20"
        : isBad
          ? "bg-destructive/10 text-destructive border-destructive/20"
          : "bg-secondary text-muted-foreground border-border";
      return (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}>
          {String(val).replace(/_/g, " ")}
        </span>
      );
    }
    
    return String(val);
  };

  const handleFileUpload = (file: File, type: "sales" | "purchase") => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result;
      if (!arrayBuffer) return;
      
      try {
        const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const json = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        
        if (type === "sales") {
          setSalesFile(file);
          setSalesRawData(json);
          setSalesCsvString(csv);
        } else {
          setPurchaseFile(file);
          setPurchaseRawData(json);
          setPurchaseCsvString(csv);
        }
      } catch (err) {
        console.error("Error reading file:", err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleScriptUpload = (file: File, type: "sales" | "purchase") => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (type === "sales") {
        setSalesScriptText(text);
      } else {
        setPurchaseScriptText(text);
      }
    };
    reader.readAsText(file);
  };

  const runTSPipeline = async () => {
    setPipelineLogs([]);
    setPipelinePhase("running");
    
    const logs: LogLine[] = [];
    const addLog = (source: "system" | "python" | "error", message: string) => {
      const line = { source, message, timestamp: new Date().toLocaleTimeString() };
      logs.push(line);
      setPipelineLogs([...logs]);
    };
    
    setTimeout(() => {
      addLog("system", "Initializing in-browser Data Imputation Engine (TypeScript)...");
    }, 100);

    setTimeout(async () => {
      try {
        addLog("system", "Synchronizing lookup database schemas from workspace server...");
        const lookups = await loadLookups();
        addLog("system", "Lookup databases successfully synchronized.");

        if (!salesRawData && !purchaseRawData) {
          addLog("error", "No raw Zoho files uploaded. Please drop Sales or Purchase spreadsheet files.");
          setPipelinePhase("error");
          return;
        }
        
        let finalSales: any[] = [];
        let finalPurchase: any[] = [];
        let salesImputedCount = 0;
        let purchaseImputedCount = 0;
        
        if (salesRawData) {
          addLog("system", `Profiling raw Sales dataset: found ${salesRawData.length} records.`);
          addLog("system", "Step 1: Normalizing column schemas & lowercasing identifiers...");
          addLog("system", "Step 2: Checking date fields & applying local timestamp fallbacks...");
          addLog("system", "Step 3: Executing balance imputation strategy (Paid -> 0, Missing -> Total)...");
          const { cleaned, imputedCount } = cleanDataTS("sales", salesRawData, lookups);
          finalSales = cleaned;
          salesImputedCount = imputedCount;
          addLog("system", `Sales clean completed. Imputed outstanding balances for ${imputedCount} invoices.`);
        }
        
        if (purchaseRawData) {
          addLog("system", `Profiling raw Purchase dataset: found ${purchaseRawData.length} records.`);
          addLog("system", "Step 1: Standardizing bill number & supplier names headers...");
          addLog("system", "Step 2: Aligning transactional dates...");
          addLog("system", "Step 3: Applying vendor balance imputations...");
          const { cleaned, imputedCount } = cleanDataTS("purchase", purchaseRawData, lookups);
          finalPurchase = cleaned;
          purchaseImputedCount = imputedCount;
          addLog("system", `Purchase clean completed. Imputed outstanding balances for ${imputedCount} bills.`);
        }
        
        setCleanedSales(finalSales);
        setCleanedPurchase(finalPurchase);
        setPipelineStats({
          salesRawCount: salesRawData?.length ?? 0,
          salesCleanedCount: finalSales.length,
          salesImputedBalances: salesImputedCount,
          purchaseRawCount: purchaseRawData?.length ?? 0,
          purchaseCleanedCount: finalPurchase.length,
          purchaseImputedBalances: purchaseImputedCount,
        });
        
        addLog("system", "Pipeline compilation successful. Cleans completed with zero exceptions.");
        setPipelinePhase("done");
      } catch (err: any) {
        addLog("error", `Engine initialization error: ${err.message || String(err)}`);
        setPipelinePhase("error");
      }
    }, 1000);
  };

  const runPythonPipeline = async () => {
    setPipelineLogs([]);
    setPipelinePhase("running");
    
    const logs: LogLine[] = [];
    const addLog = (source: "system" | "python" | "error", message: string) => {
      logs.push({ source, message, timestamp: new Date().toLocaleTimeString() });
      setPipelineLogs([...logs]);
    };
    
    addLog("system", "Connecting to local server Python runtime (v3.13)...");
    
    if (!salesCsvString && !purchaseCsvString) {
      addLog("error", "No data uploaded. Please upload Sales or Purchase files.");
      setPipelinePhase("error");
      return;
    }
    
    try {
      const result = await pythonRun({
        data: {
          salesCsv: salesCsvString || "invoice_number,customer_name,date,total,balance,status\n",
          purchaseCsv: purchaseCsvString || "bill_number,vendor_name,date,total,balance,status\n",
          salesScript: salesScriptText,
          purchaseScript: purchaseScriptText,
        }
      });
      
      setPipelineLogs(result.logs);
      
      if (!result.ok) {
        addLog("error", result.error ?? "Python script execution failed.");
        setPipelinePhase("error");
        return;
      }
      
      setCleanedSales(result.salesCleaned);
      setCleanedPurchase(result.purchaseCleaned);
      setPipelineStats(result.stats);
      setPipelinePhase("done");
    } catch (e: any) {
      addLog("error", e.message || String(e));
      setPipelinePhase("error");
    }
  };

  const downloadCleanedData = (type: "sales" | "purchase", format: "csv" | "xlsx") => {
    const data = type === "sales" ? cleanedSales : cleanedPurchase;
    if (!data || data.length === 0) return;
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cleaned Data");
    
    if (format === "xlsx") {
      XLSX.writeFile(wb, `${type}_cleaned_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}_cleaned_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  async function runSync() {
    setPhase("syncing");
    setError(null);
    setStep(0);

    const t1 = setTimeout(() => setStep(1), 700);
    const t2 = setTimeout(() => setStep(2), 1600);

    try {
      const result = await sync({ data: { fromDate, toDate } });
      clearTimeout(t1);
      clearTimeout(t2);
      setStep(3);
      if (!result.ok) {
        setError(result.error ?? "Unknown error from Zoho Books");
        setPhase("error");
        return;
      }
      setData(result);
      setPhase("done");
    } catch (e) {
      clearTimeout(t1);
      clearTimeout(t2);
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  function applyPreset(preset: "this-month" | "last-month" | "fy" | "last-fy" | "ytd") {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (preset === "this-month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(ymd(s));
      setToDate(ymd(now));
    } else if (preset === "last-month") {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(ymd(s));
      setToDate(ymd(e));
    } else if (preset === "fy") {
      const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      setFromDate(`${y}-04-01`);
      setToDate(ymd(now));
    } else if (preset === "last-fy") {
      const y = now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;
      setFromDate(`${y}-04-01`);
      setToDate(`${y + 1}-03-31`);
    } else if (preset === "ytd") {
      setFromDate(`${now.getFullYear()}-01-01`);
      setToDate(ymd(now));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Zoho Live Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time invoice ledger sync from Zoho Books via OAuth 2.0.
            </p>
          </div>
        </div>

        {activeTab === "live" && (
          <Button
            onClick={runSync}
            disabled={phase === "syncing"}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            {phase === "syncing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : phase === "done" ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Cable className="h-4 w-4" />
            )}
            {phase === "syncing"
              ? "Syncing…"
              : phase === "done"
                ? "Re-sync Zoho Books"
                : "Sync Live Zoho Books Data"}
          </Button>
        )}
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-secondary/60 p-1 border border-border/40 rounded-xl">
          <TabsTrigger value="live" className="gap-2 text-xs font-semibold">
            <RefreshCw className="h-3.5 w-3.5" />
            Live Sync &amp; Analytics
          </TabsTrigger>
          <TabsTrigger value="cleaning" className="gap-2 text-xs font-semibold">
            <Wand2 className="h-3.5 w-3.5" />
            Data Cleaning &amp; Imputation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  From date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  To date
                </label>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={defaultTo}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "this-month" as const, label: "This Month" },
                  { id: "last-month" as const, label: "Last Month" },
                  { id: "ytd" as const, label: "YTD" },
                  { id: "fy" as const, label: "FY 2026-27" },
                  { id: "last-fy" as const, label: "Last FY" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent-2"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Pulls invoices with <span className="font-mono">date</span> between the selected range from Zoho Books.
            </p>
          </div>

          {phase === "idle" && <EmptyState />}
          {phase === "syncing" && <PipelineSteps step={step} />}
          {phase === "error" && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-card mt-6">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">Zoho sync failed</h3>
                  <p className="mt-1 text-xs text-muted-foreground break-words">{error}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Verify Client ID, Client Secret, Refresh Token and Organization ID are configured.
                  </p>
                </div>
              </div>
            </div>
          )}

          {phase === "done" && data && (
            <div className="space-y-6 animate-fade-in-up mt-6">
              <PipelineSteps step={3} compact />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Total Invoices"
                  value={data.totalCount.toLocaleString("en-IN")}
                  delta={0}
                  hint={`Synced ${new Date(data.fetchedAt).toLocaleTimeString()}`}
                />
                <MetricCard label="Total Invoiced" value={formatMoney(data.totalValue, data.currency)} delta={0} />
                <MetricCard label="Collected" value={formatMoney(data.paid, data.currency)} delta={0} />
                <MetricCard
                  label="Outstanding"
                  value={formatMoney(data.outstanding, data.currency)}
                  delta={0}
                  hint="Open balance across invoices"
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-card">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Monthly Invoicing</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Total vs collected · last {data.monthly.length} month{data.monthly.length === 1 ? "" : ""}
                    </p>
                  </div>
                  <div className="h-64">
                    {data.monthly.length === 0 ? (
                      <EmptyChart label="No dated invoices returned" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.monthly} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.929 0.013 255.508)" vertical={false} />
                          <XAxis dataKey="m" tick={{ fill: "oklch(0.554 0.046 257.417)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "oklch(0.554 0.046 257.417)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: "oklch(0.696 0.17 162.48 / 0.08)" }}
                            contentStyle={{
                              background: "white",
                              border: "1px solid oklch(0.929 0.013 255.508)",
                              borderRadius: 12,
                              fontSize: 12,
                              boxShadow: "0 8px 32px -8px rgb(15 23 42 / 0.15)",
                            }}
                            formatter={(v) => formatMoney(Number(v) || 0, data.currency)}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="total" name="Invoiced" fill="oklch(0.279 0.041 260.031)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                          <Bar dataKey="paid" name="Collected" fill="oklch(0.696 0.17 162.48)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Status Breakdown</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Invoice count by status</p>
                  </div>
                  <div className="h-64">
                    {data.statusBreakdown.length === 0 ? (
                      <EmptyChart label="No invoices to break down" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.statusBreakdown}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={3}
                          >
                            {data.statusBreakdown.map((_, i) => (
                              <PieCell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="white" strokeWidth={2} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "white",
                              border: "1px solid oklch(0.929 0.013 255.508)",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              <InvoiceTable
                invoices={data.invoices}
                currency={data.currency}
                onDownload={() => exportInvoicesToCSV(data.allInvoices, data.currency)}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="cleaning" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* File upload card */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Spreadsheet Data Uploads</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload raw ledger data extracted from Zoho Live Sync (Sales &amp; Purchase)
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Sales upload */}
                  <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-5 text-center relative group hover:border-accent/40 transition-colors">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, "sales");
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="rounded-lg bg-accent/10 p-2 text-accent">
                        <Upload className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {salesFile ? salesFile.name : "Upload Sales Ledger"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {salesFile ? `${(salesFile.size / 1024).toFixed(1)} KB` : "Drag and drop CSV or Excel"}
                      </span>
                      {salesRawData && (
                        <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent-2 mt-1">
                          {salesRawData.length} records parsed
                        </span>
                      )}
                    </div>
                    {salesFile && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSalesFile(null);
                          setSalesRawData(null);
                          setSalesCsvString("");
                        }}
                        className="absolute top-2 right-2 rounded-full p-1 bg-secondary hover:bg-destructive/10 text-muted-foreground hover:text-destructive z-25"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Purchase upload */}
                  <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-5 text-center relative group hover:border-accent/40 transition-colors">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, "purchase");
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="rounded-lg bg-accent/10 p-2 text-accent">
                        <Upload className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {purchaseFile ? purchaseFile.name : "Upload Purchase Ledger"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {purchaseFile ? `${(purchaseFile.size / 1024).toFixed(1)} KB` : "Drag and drop CSV or Excel"}
                      </span>
                      {purchaseRawData && (
                        <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent-2 mt-1">
                          {purchaseRawData.length} records parsed
                        </span>
                      )}
                    </div>
                    {purchaseFile && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPurchaseFile(null);
                          setPurchaseRawData(null);
                          setPurchaseCsvString("");
                        }}
                        className="absolute top-2 right-2 rounded-full p-1 bg-secondary hover:bg-destructive/10 text-muted-foreground hover:text-destructive z-25"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={engine === "js" ? runTSPipeline : runPythonPipeline}
                    disabled={(!salesFile && !purchaseFile) || pipelinePhase === "running"}
                    className="gap-2 bg-accent hover:bg-accent/90 text-white font-semibold"
                  >
                    {pipelinePhase === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Execute Imputation Pipeline
                  </Button>
                </div>
              </div>

              {/* Console output card */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Terminal className="h-4 w-4 text-accent-2" />
                    Pipeline Logs
                  </h3>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono bg-secondary/60 px-2 py-0.5 rounded border border-border">
                    {pipelinePhase || "idle"}
                  </span>
                </div>
                
                <div className="h-48 rounded-xl bg-slate-950 p-4 font-mono text-[11px] text-slate-300 overflow-y-auto space-y-1 select-text border border-border/10">
                  {pipelineLogs.length === 0 ? (
                    <div className="text-slate-500 italic">No activity logs. Select your engine, drop your files, and execute the pipeline to inspect data progress.</div>
                  ) : (
                    pipelineLogs.map((log, index) => {
                      let colorCls = "text-slate-300";
                      if (log.source === "system") colorCls = "text-accent-2";
                      if (log.source === "error") colorCls = "text-destructive";
                      return (
                        <div key={index} className={`flex items-start gap-1 ${colorCls}`}>
                          <span className="text-slate-600 font-normal">[{log.timestamp}]</span>
                          <span className="font-semibold uppercase tracking-wider text-[9px] px-1 rounded bg-secondary/10 border border-secondary/15 mr-1">{log.source}</span>
                          <span className="whitespace-pre-wrap">{log.message}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar config card */}
            <div className="space-y-6">
              {/* Engine card */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Pipeline Engine</h3>
                <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/40 rounded-lg border border-border">
                  <button
                    onClick={() => setEngine("js")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      engine === "js" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    JS/TS Engine
                  </button>
                  <button
                    onClick={() => setEngine("python")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      engine === "python" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Python Runner
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {engine === "js" 
                    ? "Runs a standard client-side browser normalization of column schemas and outstanding balance imputation (Paid -> 0, Missing -> Total)." 
                    : "Runs custom Python cleaning scripts locally on the server host machine. Standard outputs and traceback logs are captured in the terminal console."}
                </p>
              </div>

              {/* Code editor card */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Code className="h-4 w-4 text-accent-2" />
                    Python Script
                  </h3>
                  <div className="flex bg-secondary/40 p-0.5 rounded border border-border text-[10px] font-semibold">
                    <button
                      onClick={() => setEditorTab("sales")}
                      className={`px-2 py-0.5 rounded transition-all ${
                        editorTab === "sales" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      Sales
                    </button>
                    <button
                      onClick={() => setEditorTab("purchase")}
                      className={`px-2 py-0.5 rounded transition-all ${
                        editorTab === "purchase" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      Purchase
                    </button>
                  </div>
                </div>

                <textarea
                  value={editorTab === "sales" ? salesScriptText : purchaseScriptText}
                  onChange={(e) => {
                    if (editorTab === "sales") setSalesScriptText(e.target.value);
                    else setPurchaseScriptText(e.target.value);
                  }}
                  className="w-full h-52 rounded-lg border border-border bg-secondary/20 p-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-2 leading-relaxed"
                />

                <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                  <span>Editable workspace script</span>
                  <label className="cursor-pointer text-accent-2 hover:underline flex items-center gap-1 font-semibold">
                    <Upload className="h-3 w-3" />
                    Upload .py
                    <input
                      type="file"
                      accept=".py"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleScriptUpload(file, editorTab);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Stats card */}
              {pipelinePhase === "done" && (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3 animate-fade-in-up">
                  <h3 className="text-sm font-semibold text-foreground">Imputation Summary</h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">Sales Raw Rows</span>
                      <span className="font-semibold text-foreground">{pipelineStats.salesRawCount}</span>
                    </div>
                    {engine === "js" && (
                      <div className="flex justify-between border-b border-border/40 pb-2">
                        <span className="text-muted-foreground">Sales Imputations</span>
                        <span className="font-semibold text-accent-2">{pipelineStats.salesImputedBalances} rows</span>
                      </div>
                    )}
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">Purchase Raw Rows</span>
                      <span className="font-semibold text-foreground">{pipelineStats.purchaseRawCount}</span>
                    </div>
                    {engine === "js" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Purchase Imputations</span>
                        <span className="font-semibold text-accent-2">{pipelineStats.purchaseImputedBalances} rows</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cleaned preview grid */}
          {pipelinePhase === "done" && (cleanedSales || cleanedPurchase) && (
            <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden animate-fade-in-up space-y-0">
              <div className="flex flex-wrap items-center justify-between border-b border-border px-5 py-4 gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Cleaned Data Preview</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Review and verify normalized outputs before export
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex bg-secondary/40 p-0.5 rounded border border-border text-xs mr-2 font-semibold">
                    <button
                      onClick={() => setPreviewTab("sales")}
                      className={`px-3 py-1 rounded-md transition-all ${
                        previewTab === "sales" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      Sales Clean
                    </button>
                    <button
                      onClick={() => setPreviewTab("purchase")}
                      className={`px-3 py-1 rounded-md transition-all ${
                        previewTab === "purchase" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      Purchase Clean
                    </button>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadCleanedData(previewTab, "csv")}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadCleanedData(previewTab, "xlsx")}
                    className="gap-1.5 text-xs font-semibold bg-accent/5 hover:bg-accent/10 border-accent/20 text-accent-2"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel Sheet
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-96 border border-border/40 rounded-xl shadow-inner bg-secondary/5">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/60 text-muted-foreground uppercase tracking-wider sticky top-0 bg-card z-10 border-b border-border">
                    {previewTab === "sales" ? (
                      cleanedSales && cleanedSales.length > 0 ? (
                        <tr>
                          {Object.keys(cleanedSales[0]).map((key) => (
                            <th key={key} className="px-5 py-3 text-left font-semibold whitespace-nowrap">{key}</th>
                          ))}
                        </tr>
                      ) : null
                    ) : (
                      cleanedPurchase && cleanedPurchase.length > 0 ? (
                        <tr>
                          {Object.keys(cleanedPurchase[0]).map((key) => (
                            <th key={key} className="px-5 py-3 text-left font-semibold whitespace-nowrap">{key}</th>
                          ))}
                        </tr>
                      ) : null
                    )}
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {previewTab === "sales" ? (
                      cleanedSales && cleanedSales.length > 0 ? (
                        cleanedSales.slice(0, 10).map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-secondary/20 transition-colors">
                            {Object.keys(cleanedSales[0]).map((key) => (
                              <td key={key} className="px-5 py-3.5 whitespace-nowrap font-medium text-foreground max-w-xs truncate">
                                {renderCell(key, row[key])}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-5 py-8 text-center text-muted-foreground">
                            No cleaned sales records available.
                          </td>
                        </tr>
                      )
                    ) : (
                      cleanedPurchase && cleanedPurchase.length > 0 ? (
                        cleanedPurchase.slice(0, 10).map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-secondary/20 transition-colors">
                            {Object.keys(cleanedPurchase[0]).map((key) => (
                              <td key={key} className="px-5 py-3.5 whitespace-nowrap font-medium text-foreground max-w-xs truncate">
                                {renderCell(key, row[key])}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-5 py-8 text-center text-muted-foreground">
                            No cleaned purchase records available.
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-secondary/40 px-5 py-3.5 text-xs text-muted-foreground border-t border-border flex justify-between font-medium">
                <span>Showing top 10 preview records</span>
                <span>Total records in memory: {previewTab === "sales" ? cleanedSales?.length : cleanedPurchase?.length}</span>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">No live data yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        Pull live invoice and ledger data directly from your Zoho Books organization to populate KPIs, charts and
        the live invoice table.
      </p>
      <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-secondary/60 px-3 py-1 text-[11px] text-muted-foreground">
        <Cable className="h-3 w-3" />
        Click "Sync Live Zoho Books Data" above to begin
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{label}</div>
  );
}

function PipelineSteps({ step, compact = false }: { step: number; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-border bg-card shadow-card ${compact ? "p-4" : "p-6"}`}>
      {!compact && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-foreground">Live Sync Pipeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Streaming from Zoho Books · OAuth 2.0</p>
        </div>
      )}
      <div className="space-y-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const state: "done" | "active" | "pending" =
            i < step ? "done" : i === step ? "active" : "pending";
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-300 ${
                state === "active"
                  ? "border-accent/40 bg-accent/5"
                  : state === "done"
                    ? "border-accent/30 bg-accent/[0.03]"
                    : "border-border bg-secondary/30 opacity-60"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  state === "done"
                    ? "bg-accent text-white"
                    : state === "active"
                      ? "bg-accent/15 text-accent-2"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {state === "done" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : state === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 text-sm font-medium text-foreground">{s.label}</div>
              <div className="text-[11px] font-medium uppercase tracking-wide">
                {state === "done" ? (
                  <span className="text-accent-2">Complete</span>
                ) : state === "active" ? (
                  <span className="text-accent-2">Running…</span>
                ) : (
                  <span className="text-muted-foreground">Pending</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvoiceTable({
  invoices,
  currency,
  onDownload,
}: {
  invoices: SyncResult["invoices"];
  currency: string;
  onDownload?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Live Invoices</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Top {invoices.length} most recent from Zoho Books
          </p>
        </div>
        {onDownload && (
          <Button variant="outline" size="sm" onClick={onDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">Invoice #</th>
              <th className="px-5 py-2.5 text-left font-medium">Customer</th>
              <th className="px-5 py-2.5 text-left font-medium">Date</th>
              <th className="px-5 py-2.5 text-right font-medium">Total</th>
              <th className="px-5 py-2.5 text-right font-medium">Balance</th>
              <th className="px-5 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  No invoices returned for this organization.
                </td>
              </tr>
            ) : (
              invoices.map((r) => (
                <tr key={r.invoice_id ?? r.invoice_number} className="transition-colors hover:bg-secondary/40">
                  <td className="px-5 py-3 font-mono text-xs text-foreground">{r.invoice_number ?? "—"}</td>
                  <td className="px-5 py-3 text-foreground">{r.customer_name ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.date ?? "—"}</td>
                  <td className="px-5 py-3 text-right font-medium text-foreground">
                    {typeof r.total === "number" ? formatMoney(r.total, r.currency_code ?? currency) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-foreground">
                    {typeof r.balance === "number" ? formatMoney(r.balance, r.currency_code ?? currency) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={r.status ?? "unknown"} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === "paid"
      ? "bg-accent/10 text-accent-2"
      : s === "overdue"
        ? "bg-destructive/10 text-destructive"
        : s === "sent" || s === "viewed" || s === "partially_paid"
          ? "bg-yellow-500/10 text-yellow-700"
          : "bg-secondary text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

