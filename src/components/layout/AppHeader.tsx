import { useMemo, useState } from "react";
import { CalendarRange, Bell, Search, Settings, LogOut, User, Eye, FileSpreadsheet, Tag, Users } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, getRoleTier, getPermissions } from "@/lib/auth-store";
import { useAnalytics } from "@/lib/analytics-store";
import { normalize, uniqueValues } from "@/lib/sp-analytics";
import { Logo } from "@/components/brand/Logo";
import { MobileNavTrigger } from "./AppSidebar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

type Notification = { id: string; title: string; body: string; ts: string; unread: boolean };

const SEED_NOTIFICATIONS: Notification[] = [
  { id: "n1", title: "Zoho Books sync available", body: "Pull the latest ledger snapshot from Zoho.", ts: "Just now", unread: true },
  { id: "n2", title: "FY 2026-27 report ready", body: "Executive summary refreshed with latest uploads.", ts: "2 h ago", unread: true },
  { id: "n3", title: "Permission updated", body: "Your access scope was reviewed by Admin.", ts: "Yesterday", unread: false },
];

export function AppHeader() {
  const { role, email, signOut } = useAuth();
  const navigate = useNavigate();
  const sales = useAnalytics((s) => s.sales);
  const purchase = useAnalytics((s) => s.purchase);

  const [searchOpen, setSearchOpen] = useState(false);
  const [notifs, setNotifs] = useState(SEED_NOTIFICATIONS);
  const [dense, setDense] = useState(false);
  const [showAccent, setShowAccent] = useState(true);

  const unread = notifs.filter((n) => n.unread).length;

  const searchIndex = useMemo(() => {
    const sRows = normalize(sales.files, "sales");
    const pRows = normalize(purchase.files, "purchase");
    return {
      files: [
        ...sales.files.map((f) => ({ name: f.name, kind: "Sales file" as const })),
        ...purchase.files.map((f) => ({ name: f.name, kind: "Purchase file" as const })),
      ],
      categories: Array.from(new Set([...uniqueValues(sRows, "category"), ...uniqueValues(pRows, "category")])).slice(0, 50),
      customers: uniqueValues(sRows, "party").slice(0, 50),
      vendors: uniqueValues(pRows, "party").slice(0, 50),
      items: Array.from(new Set([...uniqueValues(sRows, "item"), ...uniqueValues(pRows, "item")])).slice(0, 80),
    };
  }, [sales.files, purchase.files]);

  const goToData = () => {
    setSearchOpen(false);
    navigate({ to: "/data" });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 md:px-6 backdrop-blur-md">
      <MobileNavTrigger />
      <div className="flex md:hidden">
        <Logo size={32} />
      </div>
      <div className="hidden md:flex mr-2">
        <Logo size={34} withWordmark tagline="Analytics Suite" />
      </div>


      <button
        onClick={() => setSearchOpen(true)}
        className="hidden md:flex relative max-w-sm flex-1 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 h-9 text-sm text-muted-foreground transition-colors hover:bg-card focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search reports, ledgers, vendors…</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-card px-1.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search across uploaded data, files, categories, vendors…" />
        <CommandList>
          <CommandEmpty>No matches found. Try a category, vendor, customer or file name.</CommandEmpty>
          {searchIndex.files.length > 0 && (
            <CommandGroup heading="Uploaded files">
              {searchIndex.files.map((f) => (
                <CommandItem key={f.name} onSelect={goToData}>
                  <FileSpreadsheet className="mr-2 h-4 w-4 text-accent-2" />
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{f.kind}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {searchIndex.categories.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Categories">
                {searchIndex.categories.map((c) => (
                  <CommandItem key={`cat-${c}`} onSelect={goToData}>
                    <Tag className="mr-2 h-4 w-4 text-accent" /> {c}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {searchIndex.customers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Customers">
                {searchIndex.customers.map((c) => (
                  <CommandItem key={`cust-${c}`} onSelect={goToData}>
                    <Users className="mr-2 h-4 w-4 text-accent-2" /> {c}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {searchIndex.vendors.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Vendors">
                {searchIndex.vendors.map((v) => (
                  <CommandItem key={`vend-${v}`} onSelect={goToData}>
                    <Users className="mr-2 h-4 w-4 text-accent" /> {v}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {searchIndex.items.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Items">
                {searchIndex.items.map((i) => (
                  <CommandItem key={`itm-${i}`} onSelect={goToData}>
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-muted-foreground" /> {i}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {searchIndex.files.length === 0 && (
            <CommandGroup heading="Quick navigation">
              <CommandItem onSelect={() => { setSearchOpen(false); navigate({ to: "/data" }); }}>Go to Data Analytics</CommandItem>
              <CommandItem onSelect={() => { setSearchOpen(false); navigate({ to: "/powerbi" }); }}>Go to Power BI</CommandItem>
              <CommandItem onSelect={() => { setSearchOpen(false); navigate({ to: "/zoho" }); }}>Go to Zoho Live</CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent-2">
          <CalendarRange className="h-3.5 w-3.5" />
          Reporting Period: FY 2026-27
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Notifications</div>
                <div className="text-[11px] text-muted-foreground">{unread} unread</div>
              </div>
              <button
                onClick={() => setNotifs(notifs.map((n) => ({ ...n, unread: false })))}
                className="text-[11px] font-medium text-accent-2 hover:underline"
              >
                Mark all read
              </button>
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {notifs.map((n) => (
                <li key={n.id} className="px-4 py-3 hover:bg-secondary/40">
                  <div className="flex items-start gap-2">
                    {n.unread && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-foreground">{n.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground/80">{n.ts}</div>
                    </div>
                  </div>
                </li>
              ))}
              {notifs.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted-foreground">You're all caught up.</li>
              )}
            </ul>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2 py-1.5 shadow-soft transition-colors hover:bg-secondary">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-[11px] font-semibold text-primary-foreground">
                {(email?.[0] ?? "U").toUpperCase()}
              </div>
              <div className="hidden sm:block leading-tight pr-1 text-left">
                <div className="text-xs font-semibold text-foreground">{role}</div>
                <div className="text-[10px] text-accent-2">{getRoleTier(role)}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="text-xs font-semibold text-foreground truncate">{email ?? "Signed in"}</div>
              <div className="text-[10px] text-muted-foreground">{role} · {getRoleTier(role)}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {getPermissions(role).map((p) => (
                  <span key={p} className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent-2">
                    {p}
                  </span>
                ))}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate({ to: "/data" })}>
              <User className="mr-2 h-4 w-4" /> Profile & role
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate({ to: "/data" })}>
              <Settings className="mr-2 h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> View preferences</span>
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={dense} onCheckedChange={setDense}>
              Compact density
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showAccent} onCheckedChange={setShowAccent}>
              Show accent highlights
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                signOut();
                navigate({ to: "/login" });
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
