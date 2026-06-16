import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Send, Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askAnalyticsBot } from "@/lib/chat.functions";
import { useAnalytics } from "@/lib/analytics-store";
import { normalize, applyFilters, total, totalWaste, yoy, sumBy } from "@/lib/sp-analytics";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

function buildContext(): string {
  const { sales, purchase, filters } = useAnalytics.getState();
  const s = applyFilters(normalize(sales.files, "sales"), filters);
  const p = applyFilters(normalize(purchase.files, "purchase"), filters);
  if (!s.length && !p.length) return "No data uploaded yet.";
  const rev = total(s);
  const spd = total(p);
  const rYoy = yoy(s);
  const pYoy = yoy(p);
  const topCust = sumBy(s, (r) => r.party).slice(0, 5);
  const topVend = sumBy(p, (r) => r.party).slice(0, 5);
  const sCat = sumBy(s, (r) => r.category).slice(0, 8);
  const pCat = sumBy(p, (r) => r.category).slice(0, 8);
  return [
    `Sales rows: ${s.length}, Purchase rows: ${p.length}`,
    `Total revenue: ₹${rev.toFixed(0)} (YoY ${rYoy.pct.toFixed(1)}%)`,
    `Total spend: ₹${spd.toFixed(0)} (YoY ${pYoy.pct.toFixed(1)}%)`,
    `Gross profit: ₹${(rev - spd).toFixed(0)}`,
    `Waste throughput units: ${totalWaste(s) + totalWaste(p)}`,
    `Top customers: ${topCust.map((c) => `${c.key}=₹${c.value.toFixed(0)}`).join("; ")}`,
    `Top vendors: ${topVend.map((c) => `${c.key}=₹${c.value.toFixed(0)}`).join("; ")}`,
    `Revenue by category: ${sCat.map((c) => `${c.key}=₹${c.value.toFixed(0)}`).join("; ")}`,
    `Spend by category: ${pCat.map((c) => `${c.key}=₹${c.value.toFixed(0)}`).join("; ")}`,
  ].join("\n");
}

export function AnalyticsChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi — I'm your Data Analyst analyst. Ask me anything about revenue, spend, margins, categories or top accounts based on your uploaded data.",
    },
  ]);
  const ask = useServerFn(askAnalyticsBot);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next);
    setBusy(true);
    try {
      const ctx = buildContext();
      const history = next.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const { text } = await ask({ data: { question: q, context: ctx, history } });
      setMsgs((m) => [...m, { role: "assistant", content: text || "(no response)" }]);
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: `⚠ ${e instanceof Error ? e.message : "Something went wrong."}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-2xl shadow-accent/40 transition-transform hover:scale-105 active:scale-95"
          aria-label="Open analytics assistant"
        >
          <MessageSquare className="h-6 w-6" />
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
          </span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[min(560px,80vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-fade-in-up">
          <div className="flex items-center gap-2 border-b border-border bg-gradient-to-br from-primary to-primary/85 px-4 py-3 text-primary-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Saahas Analyst</div>
              <div className="text-[10px] opacity-80">Reasoning over your live sales & purchase data</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-secondary/30 px-3 py-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-soft",
                    m.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-card text-foreground border border-border",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
                  <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-border bg-card p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Ask about revenue, spend, top categories…"
              className="max-h-28 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
