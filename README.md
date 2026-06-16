# Saahas Insights Hub

Saahas Insights Hub is a modern analytics and data cleaning dashboard. It provides powerful integrations with Zoho Books for live ledger sync, Supabase for data persistence and authentication, and automated data imputation and cleansing engines (supporting both TypeScript and Python pipelines).

---

## 🚀 Tech Stack

- **Frontend Core**: React 19, TypeScript, TanStack Start (Router, Query, Start), Vite
- **Styling**: Tailwind CSS
- **Database & Auth**: Supabase
- **Data Pipelines**: Custom TypeScript data-cleaning logic and Python-based data imputation scripts (using `pandas`, `thefuzz`, `openpyxl`)

---

## 🛠️ Prerequisites

Make sure you have the following installed on your machine:
- **Node.js** (v18 or higher)
- **npm** or **bun**
- **Python** (v3.8 or higher, for Python data cleaning pipeline)

---

## 📦 Installation & Setup

1. **Clone the Repository** (or download the clean folder):
   ```bash
   git clone <your-repository-url>
   cd SaahasInsightsHub
   ```

2. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

3. **Install Python Cleaning Dependencies**:
   Ensure you have `pandas`, `openpyxl`, and `thefuzz` installed in your Python environment:
   ```bash
   pip install pandas openpyxl thefuzz
   ```

4. **Environment Variables**:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and insert your keys for Supabase, Zoho OAuth, and Groq API.

---

## ⚙️ How It Works (Data Cleaning Engine)

The dashboard allows importing raw CSVs for Sales and Purchases. You can toggle between two engines:
1. **JS/TS Engine**: Runs entirely in the browser/node server using standard TypeScript functions.
2. **Python Engine**: Writes temporary files to a local workspace (`scratch_cleaning`) and runs Python scripts (`clean_sales.py` and `clean_purchase.py`) using `pandas` and local lookup sheets.

### Required Lookup Files (Root Directory)
The Python cleaning scripts rely on the following lookup files located in the root directory:
- `Sales_lookup.csv`
- `Item_lookup_sales.csv`
- `Item_Cat_Update  saless.csv`
- `Item_Cat_Sales_Update (1).xlsx`
- `item_details_lookup_purchase.csv`
- `Lookup_items.xls`
- `Purchase_Items_Lookup_Category.csv`
- `Vendors_Status.csv`

Ensure these files remain in the root directory for the Python engine to map categories, standardized verticals, and compliance states successfully.

---

## 💻 Running the Application

To run the app locally in development mode:
```bash
npm run dev
```

To build the application for production:
```bash
npm run build
```

To preview the built production application:
```bash
npm run preview
```
