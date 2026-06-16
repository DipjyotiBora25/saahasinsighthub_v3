import rawMap from "./item-category-map.json";

const MAP = rawMap as Record<string, string>;

const RX_ITEM = /(item|product|description|particular|service|sku|narration)/i;

export function pickItemColumn(cols: string[]): string | undefined {
  return cols.find((c) => RX_ITEM.test(c));
}

function clean(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Lookup category for a given item string. Tries exact, then token-overlap fuzzy match. */
export function categorize(item: string | null | undefined): string | null {
  if (!item) return null;
  const key = clean(String(item));
  if (!key) return null;
  if (MAP[key]) return MAP[key];

  // partial contains
  for (const k in MAP) {
    if (key.includes(k) || k.includes(key)) return MAP[k];
  }
  return null;
}

export function allCategories(): string[] {
  return Array.from(new Set(Object.values(MAP))).sort();
}
