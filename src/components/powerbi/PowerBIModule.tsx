import { ShieldCheck, ExternalLink, Lock } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

const EMBED_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiOTBiNWUzMTEtN2Q0YS00Y2Y2LTkwNDEtODczMDNiOGU5MTAxIiwidCI6IjBlNmEwM2I0LTI4YjktNGQ3Zi1hYzNjLTM4MTYzY2Q4MzYwMCIsImMiOjEwfQ%3D%3D";

export function PowerBIModule() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Power BI Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Secure embedded reports rendered directly from Microsoft Power BI service.
            </p>
          </div>
        </div>

        <a
          href={EMBED_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-secondary"
        >
          Open in new tab
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </header>

      <div className="rounded-2xl border border-border bg-card p-2 shadow-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground">Enterprise Embed · Tenant: saahas.eco</div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" /> TLS 1.3 · Row-level security enforced
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[11px] font-medium text-accent-2">Live</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl">
          <iframe
            title="Saahas Zero Waste Power BI Report"
            src={EMBED_URL}
            className="block h-[78vh] w-full border-0"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
