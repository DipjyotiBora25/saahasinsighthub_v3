import { createServerFn } from "@tanstack/react-start";

type ZohoInvoice = {
  invoice_id?: string;
  invoice_number?: string;
  customer_name?: string;
  status?: string;
  date?: string;
  due_date?: string;
  total?: number;
  balance?: number;
  currency_code?: string;
};

type RawInvoice = Partial<ZohoInvoice> & Record<string, unknown>;

type SyncResult = {
  ok: boolean;
  error?: string;
  totalCount: number;
  totalValue: number;
  outstanding: number;
  paid: number;
  currency: string;
  statusBreakdown: { name: string; value: number }[];
  monthly: { m: string; total: number; paid: number }[];
  invoices: ZohoInvoice[];
  allInvoices: ZohoInvoice[];
  fetchedAt: string;
};

async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Zoho token error [${r.status}]: ${t}`);
  }
  const j = (await r.json()) as { access_token?: string; error?: string };
  if (!j.access_token) throw new Error(`Zoho token error: ${j.error ?? "no access_token"}`);
  return j.access_token;
}

async function fetchAllInvoices(
  token: string,
  orgId: string,
  fromDate?: string,
  toDate?: string,
): Promise<RawInvoice[]> {
  const all: RawInvoice[] = [];
  let page = 1;
  // safety cap to avoid runaway pagination
  for (let i = 0; i < 25; i++) {
    const params = new URLSearchParams({
      organization_id: orgId,
      page: String(page),
      per_page: "200",
    });
    if (fromDate) params.set("date_start", fromDate);
    if (toDate) params.set("date_end", toDate);
    const url = `https://www.zohoapis.com/books/v3/invoices?${params.toString()}`;
    const r = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Zoho invoices API [${r.status}] page ${page}: ${t}`);
    }
    const data = (await r.json()) as {
      invoices?: RawInvoice[];
      page_context?: { has_more_page?: boolean; has_more_rows?: boolean };
    };
    all.push(...(data.invoices ?? []));
    const more =
      data.page_context?.has_more_page ?? data.page_context?.has_more_rows ?? false;
    if (!more) break;
    page += 1;
  }
  return all;
}

export const syncZohoBooks = createServerFn({ method: "POST" })
  .inputValidator((data: { fromDate?: string; toDate?: string } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<SyncResult> => {
    const orgId = process.env.ZOHO_ORG_ID;
    const { fromDate, toDate } = data ?? {};
    if (!orgId) {
      return {
        ok: false,
        error: "ZOHO_ORG_ID is not configured",
        totalCount: 0,
        totalValue: 0,
        outstanding: 0,
        paid: 0,
        currency: "INR",
        statusBreakdown: [],
        monthly: [],
        invoices: [],
        allInvoices: [],
        fetchedAt: new Date().toISOString(),
      };
    }

    try {
      const token = await getAccessToken();
      const invoices = await fetchAllInvoices(token, orgId, fromDate, toDate);

      let totalValue = 0;
      let outstanding = 0;
      let paid = 0;
      const statusMap = new Map<string, number>();
      const monthMap = new Map<string, { total: number; paid: number }>();
      let currency = "INR";

      for (const inv of invoices) {
        const total = Number(inv.total ?? 0) || 0;
        const balance = Number(inv.balance ?? 0) || 0;
        totalValue += total;
        outstanding += balance;
        paid += Math.max(0, total - balance);
        if (typeof inv.currency_code === "string" && inv.currency_code) currency = inv.currency_code;
        const status = (inv.status as string) || "unknown";
        statusMap.set(status, (statusMap.get(status) ?? 0) + 1);

        const date = (inv.date as string) || "";
        if (date.length >= 7) {
          const ym = date.slice(0, 7);
          const cur = monthMap.get(ym) ?? { total: 0, paid: 0 };
          cur.total += total;
          cur.paid += Math.max(0, total - balance);
          monthMap.set(ym, cur);
        }
      }

      const statusBreakdown = Array.from(statusMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const monthly = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([m, v]) => ({ m, total: Math.round(v.total), paid: Math.round(v.paid) }));

      const allInvoices = invoices
        .slice()
        .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
        .map((i) => ({
          invoice_id: i.invoice_id,
          invoice_number: i.invoice_number,
          customer_name: i.customer_name,
          status: i.status,
          date: i.date,
          due_date: i.due_date,
          total: i.total,
          balance: i.balance,
          currency_code: i.currency_code,
        }));

      const trimmed = allInvoices.slice(0, 50);

      return {
        ok: true,
        totalCount: invoices.length,
        totalValue,
        outstanding,
        paid,
        currency,
        statusBreakdown,
        monthly,
        invoices: trimmed,
        allInvoices,
        fetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        totalCount: 0,
        totalValue: 0,
        outstanding: 0,
        paid: 0,
        currency: "INR",
        statusBreakdown: [],
        monthly: [],
        invoices: [],
        allInvoices: [],
        fetchedAt: new Date().toISOString(),
      };
    }
  });


export type { SyncResult, ZohoInvoice };
