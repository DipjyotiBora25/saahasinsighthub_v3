import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseFile, findLinkingFeatures, type ParsedFile, type LinkingFeature } from "@/lib/feature-linker";

type Props = {
  files: ParsedFile[];
  features: LinkingFeature[];
  onFilesChange: (files: ParsedFile[], features: LinkingFeature[]) => void;
  canWrite?: boolean;
  canDelete?: boolean;
};

export function MultiFileUpload({ files, onFilesChange, canWrite = true, canDelete = true }: Props) {
  const [hover, setHover] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = async (incoming: FileList | File[]) => {
    if (!canWrite) return;
    const list = Array.from(incoming);
    if (!list.length) return;
    setLoading(true);
    try {
      const parsed: ParsedFile[] = [];
      for (const f of list) {
        try {
          parsed.push(await parseFile(f));
        } catch {
          /* skip unparseable */
        }
      }
      const merged = [...files, ...parsed].filter(
        (f, i, arr) => arr.findIndex((x) => x.name === f.name && x.size === f.size) === i,
      );
      onFilesChange(merged, findLinkingFeatures(merged));
    } finally {
      setLoading(false);
    }
  };

  const removeFile = (name: string) => {
    if (!canDelete) return;
    const next = files.filter((f) => f.name !== name);
    onFilesChange(next, findLinkingFeatures(next));
  };

  const clearAll = () => {
    if (!canDelete) return;
    onFilesChange([], []);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div
          onDragOver={(e) => { if (!canWrite) return; e.preventDefault(); setHover(true); }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHover(false);
            if (!canWrite) return;
            if (e.dataTransfer.files) ingest(e.dataTransfer.files);
          }}
          onClick={() => canWrite && inputRef.current?.click()}
          className={`group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all duration-300 ${
            !canWrite
              ? "cursor-not-allowed border-border bg-secondary/30 opacity-60"
              : hover
                ? "cursor-pointer border-accent bg-accent/5 scale-[1.005]"
                : "cursor-pointer border-border bg-secondary/30 hover:border-accent/60 hover:bg-accent/5"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls,.json,.tsv"
            className="sr-only"
            onChange={(e) => e.target.files && ingest(e.target.files)}
            disabled={!canWrite}
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent transition-transform group-hover:scale-110">
            {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
          </div>
          <div>
            <div className="text-base font-semibold text-foreground">
              {!canWrite ? "Upload disabled for your role" : loading ? "Parsing files…" : "Drop one or more datasets"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Upload multiple .xlsx, .csv, .tsv or .json files
            </div>
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Click to browse · multi-select supported
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Uploaded datasets</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{files.length} file{files.length === 1 ? "" : "s"} parsed</p>
            </div>
            {canDelete && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs">Clear all</Button>
            )}
          </div>
          <ul className="divide-y divide-border">
            {files.map((f) => (
              <li key={f.name} className="flex items-start justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/40">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent-2" />
                    <span className="truncate text-sm font-medium text-foreground">{f.name}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {f.rowCount.toLocaleString()} rows · {f.columns.length} columns · {(f.size / 1024).toFixed(1)} KB
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {f.columns.slice(0, 6).map((c) => (
                      <span key={c} className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{c}</span>
                    ))}
                    {f.columns.length > 6 && (
                      <span className="text-[10px] text-muted-foreground">+{f.columns.length - 6}</span>
                    )}
                  </div>
                </div>
                {canDelete && (
                  <button
                    onClick={() => removeFile(f.name)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
