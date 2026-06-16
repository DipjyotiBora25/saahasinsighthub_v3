import { useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Filter, ShoppingCart, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MetricCard } from "./MetricCard";
import { MultiFileUpload } from "./MultiFileUpload";
import { StitchedInsights } from "./StitchedInsights";
import { Logo } from "@/components/brand/Logo";

import { useAnalytics } from "@/lib/analytics-store";
import { useAuth, can } from "@/lib/auth-store";
import {
  normalize,
  applyFilters,
  uniqueValues,
  sumBy,
  monthlyTrend,
  yoy,
  total,
  totalWaste,
  fmtINR,
  type Filters,
  type NormalRow,
} from "@/lib/sp-analytics";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const CHART_GRID = "oklch(0.929 0.013 255.508)";
const AXIS = "oklch(0.554 0.046 257.417)";
const REVENUE = "oklch(0.696 0.17 162.48)";
const SPEND = "oklch(0.279 0.041 260.031)";
const PROFIT = "oklch(0.609 0.155 163.225)";
const CATEGORY_PALETTE = [
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#ef4444",
  "#8b5cf6",
  "#1f2937",
  "#0ea5e9",
  "#84cc16",
  "#f97316",
  "#06b6d4",
  "#a855f7",
  "#22c55e",
  "#eab308",
  "#3b82f6",
  "#d946ef",
  "#64748b",
  "#0d9488",
  "#be123c",
  "#7c3aed",
  "#15803d",
  "#c2410c",
  "#0891b2",
];

function buildCategoryColorMap(categories: string[]): Map<string, string> {
  return new Map(
    categories.map((category, index) => [
      category,
      CATEGORY_PALETTE[index] ?? `hsl(${(index * 137.508) % 360} 70% 45%)`,
    ]),
  );
}

export function DataAnalyticsModule() {
  const role = useAuth((s) => s.role);
  const canWrite = can(role, "write");
  const canDelete = can(role, "delete");
  const sales = useAnalytics((s) => s.sales);
  const purchase = useAnalytics((s) => s.purchase);
  const filters = useAnalytics((s) => s.filters);
  const setSales = useAnalytics((s) => s.setSales);
  const setPurchase = useAnalytics((s) => s.setPurchase);
  const setFilters = useAnalytics((s) => s.setFilters);
  const resetAll = useAnalytics((s) => s.resetAll);

  const salesRows = useMemo(() => normalize(sales.files, "sales"), [sales.files]);
  const purchaseRows = useMemo(() => normalize(purchase.files, "purchase"), [purchase.files]);

  const ready = sales.files.length > 0 || purchase.files.length > 0;

  const allCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...uniqueValues(salesRows, "category"),
          ...uniqueValues(purchaseRows, "category"),
        ]),
      ).sort(),
    [salesRows, purchaseRows],
  );
  const allParties = useMemo(
    () =>
      Array.from(
        new Set([...uniqueValues(salesRows, "party"), ...uniqueValues(purchaseRows, "party")]),
      ).sort(),
    [salesRows, purchaseRows],
  );
  const allItems = useMemo(
    () =>
      Array.from(
        new Set([...uniqueValues(salesRows, "item"), ...uniqueValues(purchaseRows, "item")]),
      ).sort(),
    [salesRows, purchaseRows],
  );
  const allDivisions = useMemo(
    () =>
      Array.from(
        new Set([
          ...uniqueValues(salesRows, "division"),
          ...uniqueValues(purchaseRows, "division"),
        ]),
      ).sort(),
    [salesRows, purchaseRows],
  );


  const fSales = useMemo(() => applyFilters(salesRows, filters), [salesRows, filters]);
  const fPurchase = useMemo(() => applyFilters(purchaseRows, filters), [purchaseRows, filters]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Data Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload Sales & Purchase data — we auto-parse, classify, and build an executive cut you
              can slice.
            </p>
          </div>
        </div>

        {ready && canDelete && (
          <Button variant="outline" onClick={resetAll} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Reset
          </Button>
        )}
      </header>

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList className="bg-secondary/60 p-1">
          <TabsTrigger value="sales" className="gap-2">
            <ShoppingCart className="h-4 w-4" /> Sales Data
            {sales.files.length > 0 && (
              <span className="ml-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-2">
                {sales.files.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="purchase" className="gap-2">
            <Truck className="h-4 w-4" /> Purchase Data
            {purchase.files.length > 0 && (
              <span className="ml-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-2">
                {purchase.files.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <MultiFileUpload
            files={sales.files}
            features={sales.features}
            onFilesChange={(files, features) => setSales({ files, features })}
            canWrite={canWrite}
            canDelete={canDelete}
          />
        </TabsContent>
        <TabsContent value="purchase">
          <MultiFileUpload
            files={purchase.files}
            features={purchase.features}
            onFilesChange={(files, features) => setPurchase({ files, features })}
            canWrite={canWrite}
            canDelete={canDelete}
          />
        </TabsContent>
      </Tabs>

      {ready && (
        <div className="animate-fade-in-up grid gap-6 lg:grid-cols-[260px_1fr]">
          <SlicerPanel
            filters={filters}
            setFilters={setFilters}
            categories={allCategories}
            parties={allParties}
            items={allItems}
            divisions={allDivisions}
            salesCount={fSales.length}
            purchaseCount={fPurchase.length}
          />
          <div className="space-y-6 min-w-0">
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="bg-secondary/60 p-1">
                <TabsTrigger value="overview">Executive Overview</TabsTrigger>
                <TabsTrigger value="unification">Unification Sales &amp; Purchase data</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="space-y-6">
                <ExecutiveSummary sales={fSales} purchase={fPurchase} view="overview" />
              </TabsContent>
              <TabsContent value="unification" className="space-y-6">
                <ExecutiveSummary sales={fSales} purchase={fPurchase} view="unification" />
                <StitchedInsights sales={fSales} purchase={fPurchase} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

    </div>
  );
}

function SlicerPanel({
  filters,
  setFilters,
  categories,
  parties,
  items,
  divisions,
  salesCount,
  purchaseCount,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  categories: string[];
  parties: string[];
  items: string[];
  divisions: string[];
  salesCount: number;
  purchaseCount: number;
}) {
  const toggle = (list: string[] | undefined, v: string) => {
    const set = new Set(list ?? []);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    return Array.from(set);
  };

  return (
    <aside className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Filter className="h-4 w-4 text-accent-2" />
        <h3 className="text-sm font-semibold text-foreground">Slicers</h3>
        <button
          onClick={() => setFilters({})}
          className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-accent-2"
        >
          Clear
        </button>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between rounded-md bg-secondary/60 px-2 py-1">
          <span>Sales rows</span>
          <span className="font-semibold text-foreground">{salesCount.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-secondary/60 px-2 py-1">
          <span>Purchase rows</span>
          <span className="font-semibold text-foreground">{purchaseCount.toLocaleString()}</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Date range
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={filters.from ? filters.from.toISOString().slice(0, 10) : ""}
            onChange={(e) =>
              setFilters({ ...filters, from: e.target.value ? new Date(e.target.value) : null })
            }
            className="h-8 text-xs"
          />
          <Input
            type="date"
            value={filters.to ? filters.to.toISOString().slice(0, 10) : ""}
            onChange={(e) =>
              setFilters({ ...filters, to: e.target.value ? new Date(e.target.value) : null })
            }
            className="h-8 text-xs"
          />
        </div>
      </div>

      <SlicerList
        label="Category"
        options={categories}
        selected={filters.categories ?? []}
        onToggle={(v) => setFilters({ ...filters, categories: toggle(filters.categories, v) })}
      />
      <SlicerList
        label="Business Division"
        options={divisions}
        selected={filters.divisions ?? []}
        onToggle={(v) => setFilters({ ...filters, divisions: toggle(filters.divisions, v) })}
      />

      <SlicerList
        label="Item"
        options={items}
        selected={filters.items ?? []}
        onToggle={(v) => setFilters({ ...filters, items: toggle(filters.items, v) })}
      />
      <SlicerList
        label="Customer / Vendor"
        options={parties}
        selected={filters.parties ?? []}
        onToggle={(v) => setFilters({ ...filters, parties: toggle(filters.parties, v) })}
      />
    </aside>
  );
}

function SlicerList({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
        {selected.length > 0 && (
          <span className="text-[10px] font-semibold text-accent-2">
            {selected.length} selected
          </span>
        )}
      </div>
      <Input
        placeholder={`Search ${label.toLowerCase()}…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8 text-xs"
      />
      <ScrollArea className="h-40 rounded-md border border-border bg-secondary/30">
        <ul className="p-2 space-y-1">
          {filtered.length === 0 && (
            <li className="px-1 text-[11px] text-muted-foreground">No options</li>
          )}
          {filtered.slice(0, 200).map((o) => (
            <li key={o}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-card">
                <Checkbox checked={selected.includes(o)} onCheckedChange={() => onToggle(o)} />
                <span className="truncate" title={o}>
                  {o}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

function ExecutiveSummary({ sales, purchase, view }: { sales: NormalRow[]; purchase: NormalRow[]; view: "overview" | "unification" }) {
  const revYoy = yoy(sales);
  const spendYoy = yoy(purchase);
  const revenue = total(sales);
  const spend = total(purchase);
  const profit = revenue - spend;
  const waste = totalWaste(sales) + totalWaste(purchase);

  const salesMonthly = monthlyTrend(sales);
  const spendMonthly = monthlyTrend(purchase);
  const months = Array.from(
    new Set([...salesMonthly.map((m) => m.key), ...spendMonthly.map((m) => m.key)]),
  ).sort();
  const combinedMonthly = months.map((m) => ({
    m,
    revenue: salesMonthly.find((x) => x.key === m)?.value ?? 0,
    spend: spendMonthly.find((x) => x.key === m)?.value ?? 0,
    profit:
      (salesMonthly.find((x) => x.key === m)?.value ?? 0) -
      (spendMonthly.find((x) => x.key === m)?.value ?? 0),
  }));

  const topCustomers = sumBy(sales, (r) => r.party).slice(0, 8);
  const topVendors = sumBy(purchase, (r) => r.party).slice(0, 8);
  const salesByCategory = sumBy(sales, (r) => r.category);
  const spendByCategory = sumBy(purchase, (r) => r.category);
  const allCats = Array.from(
    new Set([...salesByCategory.map((c) => c.key), ...spendByCategory.map((c) => c.key)]),
  ).sort();
  const categoryColors = buildCategoryColorMap(allCats);
  const colorForCategory = (category: string) =>
    categoryColors.get(category) ?? CATEGORY_PALETTE[0];
  const categoryCompare = allCats
    .map((c) => ({
      category: c,
      revenue: salesByCategory.find((x) => x.key === c)?.value ?? 0,
      spend: spendByCategory.find((x) => x.key === c)?.value ?? 0,
    }))
    .sort((a, b) => b.revenue + b.spend - (a.revenue + a.spend))
    .slice(0, 10);

  if (view === "unification") {
    return (
      <section className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-accent-2" />
            <h2 className="text-sm font-semibold text-foreground">Executive Summary — Unification</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sales and purchase streams unified by category. Revenue {fmtINR(revenue)} vs Spend{" "}
            {fmtINR(spend)} ={" "}
            <span className={profit >= 0 ? "text-accent-2 font-semibold" : "text-destructive font-semibold"}>
              {profit >= 0 ? "Profit " : "Loss "}
              {fmtINR(Math.abs(profit))}
            </span>
            . Same colors below indicate the same category across revenue and spend.
          </p>
        </div>

        <ChartCard
          title="Category — Revenue vs Spend"
          subtitle="What you earn vs what you spend, by category"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryCompare} margin={{ top: 10, right: 10, bottom: 30, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis
                dataKey="category"
                tick={{ fill: AXIS, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                angle={-20}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Revenue" fill={REVENUE} radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="spend" name="Spend" fill={SPEND} radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="Revenue Mix by Category"
            subtitle="Share of total revenue — colors match the spend pie"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={salesByCategory.slice(0, 8)}
                  dataKey="value"
                  nameKey="key"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {salesByCategory.slice(0, 8).map((c) => (
                    <Cell key={c.key} fill={colorForCategory(c.key)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard
            title="Spend Mix by Category"
            subtitle="Share of total spend — same color = same category"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={spendByCategory.slice(0, 8)}
                  dataKey="value"
                  nameKey="key"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {spendByCategory.slice(0, 8).map((c) => (
                    <Cell key={c.key} fill={colorForCategory(c.key)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-accent-2" />
          <h2 className="text-sm font-semibold text-foreground">Executive Summary</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Consolidated view across sales and procurement — revenue, spend, gross profit and waste
          throughput.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Revenue"
          value={fmtINR(revenue)}
          delta={revYoy.pct}
          hint="YoY change"
        />
        <MetricCard
          label="Total Spend"
          value={fmtINR(spend)}
          delta={spendYoy.pct}
          hint="YoY change"
        />
        <MetricCard
          label={profit >= 0 ? "Gross Profit" : "Gross Loss"}
          value={fmtINR(Math.abs(profit))}
          delta={revenue ? (profit / revenue) * 100 : 0}
          hint="Margin %"
        />
        <MetricCard
          label="Waste Processed"
          value={waste ? `${waste.toLocaleString()} units` : "—"}
          delta={0}
          hint="Sales + procurement qty"
        />
      </div>

      <ChartCard title="Revenue vs Spend vs Profit" subtitle="Monthly composite">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={combinedMonthly}
            margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis
              dataKey="m"
              tick={{ fill: AXIS, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="revenue"
              name="Revenue"
              fill={REVENUE}
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
            />
            <Bar dataKey="spend" name="Spend" fill={SPEND} radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Line
              type="monotone"
              dataKey="profit"
              name="Profit"
              stroke={PROFIT}
              strokeWidth={2.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Monthly Revenue Trend" subtitle="From sales uploads">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={salesMonthly.map((x) => ({ m: x.key, v: x.value }))}
              margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
            >
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REVENUE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={REVENUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis
                dataKey="m"
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={REVENUE}
                strokeWidth={2.5}
                fill="url(#rev)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Spend Trend" subtitle="From purchase uploads">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={spendMonthly.map((x) => ({ m: x.key, v: x.value }))}
              margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
            >
              <defs>
                <linearGradient id="spd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SPEND} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={SPEND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis
                dataKey="m"
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
              <Area type="monotone" dataKey="v" stroke={SPEND} strokeWidth={2.5} fill="url(#spd)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Top Customers by Revenue" subtitle="Top 8">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={topCustomers.map((x) => ({ name: x.key, value: x.value }))}
              layout="vertical"
              margin={{ top: 5, right: 16, bottom: 5, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={120}
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
              <Bar dataKey="value" fill={REVENUE} radius={[0, 6, 6, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Vendors by Spend" subtitle="Top 8">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={topVendors.map((x) => ({ name: x.key, value: x.value }))}
              layout="vertical"
              margin={{ top: 5, right: 16, bottom: 5, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={120}
                tick={{ fill: AXIS, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={(v: unknown) => fmtINR(Number(v) || 0)} contentStyle={tipStyle} />
              <Bar dataKey="value" fill={SPEND} radius={[0, 6, 6, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

    </section>
  );
}

const tipStyle = {
  background: "white",
  border: `1px solid ${CHART_GRID}`,
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 8px 32px -8px rgb(15 23 42 / 0.15)",
} as const;

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="h-72">{children}</div>
    </div>
  );
}
