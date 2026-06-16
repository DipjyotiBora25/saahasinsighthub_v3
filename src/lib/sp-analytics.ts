import type { ParsedFile } from "./feature-linker";
import { categorize, pickItemColumn } from "./category-lookup";

export type Stream = "sales" | "purchase";

export type NormalRow = {
  item: string;
  date: Date | null;
  amount: number;
  party: string; // customer for sales, vendor for purchase
  category: string;
  division: string; // business division / CF.Business Verticals
  waste: number; // tonnage / kg / qty if detectable
  raw: Record<string, unknown>;
};

const RX = {
  date: /(date|invoice.?date|txn|transaction|posted|created|bill.?date)/i,
  amount: /(amount|total|revenue|sales|value|net|grand.?total|sub.?total|price|spend|cost|paid)/i,
  customer: /(customer|client|buyer|party|account.?name|sold.?to)/i,
  vendor: /(vendor|supplier|seller|payee|bill.?from)/i,
  // Category column only — do NOT match item/description/product columns
  category: /^(category|segment|waste.?type|class|group|item.?category|product.?category)$/i,
  // Business division / CF.Business Verticals — treat as one
  division: /(business.?division|business.?vertical|cf\.?business.?vertical|division|vertical)/i,
  qty: /(qty|quantity|weight|tonnes|tonnage|kg|waste|volume)/i,
};

function pickCol(cols: string[], rx: RegExp): string | undefined {
  return cols.find((c) => rx.test(c));
}

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[, ₹$€]/g, ""));
  return isNaN(n) ? 0 : n;
}

function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export function normalize(files: ParsedFile[], stream: Stream): NormalRow[] {
  const out: NormalRow[] = [];
  for (const f of files) {
    const cols = f.columns;
    const dateC = pickCol(cols, RX.date);
    const amtC = pickCol(cols, RX.amount);
    const partyC = stream === "sales" ? pickCol(cols, RX.customer) : pickCol(cols, RX.vendor);
    const fallbackParty = pickCol(cols, stream === "sales" ? RX.vendor : RX.customer);
    const catC = pickCol(cols, RX.category);
    const divC = pickCol(cols, RX.division);
    const itemC = pickItemColumn(cols);
    const qtyC = pickCol(cols, RX.qty);
    for (const r of f.rows) {
      const amount = amtC ? toNum(r[amtC]) : 0;
      if (!amount && !qtyC) continue;
      const item = String((itemC && r[itemC]) || "").trim();
      const rawCat = String((catC && r[catC]) || "").trim();
      // Lookup-derived category beats raw column when item maps cleanly.
      const lookup = categorize(item);
      const category = lookup || rawCat || "Uncategorized";
      const division = String((divC && r[divC]) || "").trim() || "Unspecified";
      out.push({
        item: item || "—",
        date: dateC ? toDate(r[dateC]) : null,
        amount,
        party: String((partyC && r[partyC]) || (fallbackParty && r[fallbackParty]) || "Unspecified").trim() || "Unspecified",
        category,
        division,
        waste: qtyC ? toNum(r[qtyC]) : 0,
        raw: r,
      });
    }
  }
  return out;
}

export type Filters = {
  from?: Date | null;
  to?: Date | null;
  categories?: string[];
  parties?: string[];
  items?: string[];
  divisions?: string[];
};

export function applyFilters(rows: NormalRow[], f: Filters): NormalRow[] {
  return rows.filter((r) => {
    if (f.from && r.date && r.date < f.from) return false;
    if (f.to && r.date && r.date > f.to) return false;
    if (f.categories?.length && !f.categories.includes(r.category)) return false;
    if (f.parties?.length && !f.parties.includes(r.party)) return false;
    if (f.items?.length && !f.items.includes(r.item)) return false;
    if (f.divisions?.length && !f.divisions.includes(r.division)) return false;
    return true;
  });
}

export function uniqueValues(rows: NormalRow[], key: "category" | "party" | "item" | "division"): string[] {
  return Array.from(new Set(rows.map((r) => r[key]))).filter(Boolean).sort();
}


export type Bucket = { key: string; value: number };

export function sumBy(rows: NormalRow[], keyFn: (r: NormalRow) => string, field: "amount" | "waste" = "amount"): Bucket[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) ?? 0) + r[field]);
  return Array.from(m, ([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

export function monthlyTrend(rows: NormalRow[]): Bucket[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.date) continue;
    const k = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
    m.set(k, (m.get(k) ?? 0) + r.amount);
  }
  return Array.from(m, ([key, value]) => ({ key, value })).sort((a, b) => a.key.localeCompare(b.key));
}

export function yoy(rows: NormalRow[]): { current: number; prior: number; pct: number } {
  const byYear = new Map<number, number>();
  for (const r of rows) {
    if (!r.date) continue;
    const y = r.date.getFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + r.amount);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);
  if (!years.length) {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { current: total, prior: 0, pct: 0 };
  }
  const current = byYear.get(years[0]) ?? 0;
  const prior = years[1] ? byYear.get(years[1]) ?? 0 : 0;
  const pct = prior ? ((current - prior) / prior) * 100 : 0;
  return { current, prior, pct };
}

export function totalWaste(rows: NormalRow[]): number {
  return rows.reduce((s, r) => s + r.waste, 0);
}

export function total(rows: NormalRow[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

export function fmtINR(n: number): string {
  if (Math.abs(n) >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`;
  if (Math.abs(n) >= 1e3) return `₹ ${(n / 1e3).toFixed(1)} K`;
  return `₹ ${n.toFixed(0)}`;
}
