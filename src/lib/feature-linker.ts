import * as XLSX from "xlsx";

export type ParsedFile = {
  name: string;
  size: number;
  rowCount: number;
  columns: string[];
  sample: Record<string, unknown>[];
  rows: Record<string, unknown>[];
};

export type LinkingFeature = {
  key: string;
  files: string[];
  coverage: number; // 0-1, fraction of files that contain it
  type: "id" | "date" | "category" | "numeric" | "text";
  overlapRatio?: number; // value overlap across files (0-1)
};

const normalizeKey = (k: string) =>
  k.trim().toLowerCase().replace(/[\s_\-]+/g, "_").replace(/[^a-z0-9_]/g, "");

function guessType(values: unknown[]): LinkingFeature["type"] {
  const sample = values.filter((v) => v !== null && v !== undefined && v !== "").slice(0, 50);
  if (!sample.length) return "text";
  const numericHits = sample.filter((v) => !isNaN(Number(v as number))).length;
  const dateHits = sample.filter((v) => !isNaN(Date.parse(String(v)))).length;
  if (dateHits / sample.length > 0.7 && numericHits / sample.length < 0.7) return "date";
  if (numericHits / sample.length > 0.85) return "numeric";
  const unique = new Set(sample.map(String)).size;
  if (unique / sample.length > 0.9) return "id";
  if (unique <= Math.max(8, sample.length * 0.2)) return "category";
  return "text";
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const columns = json.length ? Object.keys(json[0]) : [];
  return {
    name: file.name,
    size: file.size,
    rowCount: json.length,
    columns,
    sample: json.slice(0, 5),
    rows: json,
  };
}

export function findLinkingFeatures(files: ParsedFile[]): LinkingFeature[] {
  if (files.length < 1) return [];
  const map = new Map<string, { files: Set<string>; original: string; values: Map<string, Set<string>> }>();

  for (const f of files) {
    for (const col of f.columns) {
      const key = normalizeKey(col);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { files: new Set(), original: col, values: new Map() });
      const entry = map.get(key)!;
      entry.files.add(f.name);
    }
  }

  const features: LinkingFeature[] = [];
  for (const [key, entry] of map.entries()) {
    if (entry.files.size < 2 && files.length > 1) continue; // only matters across files
    // Gather values from samples for type detection + overlap
    const perFileValues: Set<string>[] = [];
    let allValues: unknown[] = [];
    for (const f of files) {
      const col = f.columns.find((c) => normalizeKey(c) === key);
      if (!col) continue;
      const vals = f.rows.map((r) => r[col]).filter((v) => v != null && v !== "");
      allValues = allValues.concat(vals.slice(0, 200));
      perFileValues.push(new Set(vals.map((v) => String(v).trim().toLowerCase())));
    }
    let overlap: number | undefined;
    if (perFileValues.length >= 2) {
      const inter = [...perFileValues[0]].filter((v) => perFileValues.every((s) => s.has(v)));
      const union = new Set(perFileValues.flatMap((s) => [...s]));
      overlap = union.size ? inter.length / union.size : 0;
    }
    features.push({
      key: entry.original,
      files: [...entry.files],
      coverage: entry.files.size / files.length,
      type: guessType(allValues),
      overlapRatio: overlap,
    });
  }

  return features.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    const score = (f: LinkingFeature) => (f.type === "id" ? 3 : f.type === "date" ? 2 : f.type === "category" ? 1 : 0);
    return score(b) - score(a);
  });
}
