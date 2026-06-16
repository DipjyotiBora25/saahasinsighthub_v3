import { useMemo } from "react";
import { Link2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Treemap,
} from "recharts";
import { sumBy, fmtINR, type NormalRow } from "@/lib/sp-analytics";

const CHART_GRID = "oklch(0.929 0.013 255.508)";
const AXIS = "oklch(0.554 0.046 257.417)";
const REVENUE = "oklch(0.696 0.17 162.48)";
const SPEND = "oklch(0.279 0.041 260.031)";

const tipStyle = {
  background: "white",
  border: `1px solid ${CHART_GRID}`,
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 8px 32px -8px rgb(15 23 42 / 0.15)",
} as const;

type Row = { category: string; revenue: number; spend: number; net: number; margin: number };

export function StitchedInsights({ sales, purchase }: { sales: NormalRow[]; purchase: NormalRow[] }) {
  const rows = useMemo<Row[]>(() => {
    const s = sumBy(sales, (r) => r.category);
    const p = sumBy(purchase, (r) => r.category);
    const keys = Array.from(new Set([...s.map((x) => x.key), ...p.map((x) => x.key)]));
    return keys
      .map((c) => {
        const revenue = s.find((x) => x.key === c)?.value ?? 0;
        const spend = p.find((x) => x.key === c)?.value ?? 0;
        const net = revenue - spend;
        const margin = revenue ? (net / revenue) * 100 : spend ? -100 : 0;
        return { category: c, revenue, spend, net, margin };
      })
      .filter((r) => r.revenue > 0 || r.spend > 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [sales, purchase]);

  if (!sales.length || !purchase.length) return null;

  const top = rows.slice(0, 12);
  const treemap = rows
    .filter((r) => r.revenue + r.spend > 0)
    .slice(0, 20)
    .map((r) => ({
      name: r.category,
      size: r.revenue + r.spend,
      fill: r.net >= 0 ? REVENUE : SPEND,
    }));
  const profitable = rows.filter((r) => r.net > 0).length;
  const loss = rows.filter((r) => r.net < 0).length;
  const matched = rows.filter((r) => r.revenue > 0 && r.spend > 0).length;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-secondary/30 p-5 shadow-card">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-accent-2" />
          <h2 className="text-sm font-semibold text-foreground">Stitched Insights — Sales × Purchase by Category</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Category is the shared key tying both streams. {matched} categories appear in both — {profitable} profitable,{" "}
          {loss} loss-making.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <Stat label="Categories matched" value={matched} />
          <Stat label="Profitable" value={profitable} accent />
          <Stat label="Loss-making" value={loss} negative />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="text-sm font-semibold text-foreground">Net contribution by category</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Revenue minus spend — positive bars earn, negative drain.</p>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} margin={{ top: 10, right: 10, bottom: 40, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="category" tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Revenue" fill={REVENUE} radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="spend" name="Spend" fill={SPEND} radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h3 className="text-sm font-semibold text-foreground">Category footprint map</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Box size = combined value. Green = net positive, dark = net loss.</p>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap data={treemap} dataKey="size" stroke="#fff" />
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h3 className="text-sm font-semibold text-foreground">Category P&L breakdown</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Top 12 categories by absolute impact.</p>
          <div className="mt-3 max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium">Category</th>
                  <th className="px-2 py-2 text-right font-medium">Revenue</th>
                  <th className="px-2 py-2 text-right font-medium">Spend</th>
                  <th className="px-2 py-2 text-right font-medium">Net</th>
                  <th className="px-2 py-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {top.map((r) => (
                  <tr key={r.category} className="hover:bg-secondary/40">
                    <td className="px-2 py-2 font-medium text-foreground">{r.category}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{fmtINR(r.revenue)}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{fmtINR(r.spend)}</td>
                    <td className={`px-2 py-2 text-right font-semibold ${r.net >= 0 ? "text-accent-2" : "text-destructive"}`}>
                      {r.net >= 0 ? "+" : "−"}{fmtINR(Math.abs(r.net))}
                    </td>
                    <td className={`px-2 py-2 text-right ${r.margin >= 0 ? "text-accent-2" : "text-destructive"}`}>
                      {r.margin.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, accent, negative }: { label: string; value: number; accent?: boolean; negative?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${accent ? "text-accent-2" : negative ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
