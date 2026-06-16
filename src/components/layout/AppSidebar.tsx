import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ModuleIcon } from "@/components/brand/ModuleIcon";
import { useAuth, getAllowedModules, type Module } from "@/lib/auth-store";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type IconKind = "saahas" | "powerbi" | "zoho";

type NavItem = {
  module: Module;
  to: "/data" | "/powerbi" | "/zoho";
  label: string;
  iconKind: IconKind;
  description: string;
};

const NAV: NavItem[] = [
  { module: "data", to: "/data", label: "Data Analytics", iconKind: "saahas", description: "File-based insights" },
  { module: "powerbi", to: "/powerbi", label: "Power BI Analytics", iconKind: "powerbi", description: "Embedded reports" },
  { module: "zoho", to: "/zoho", label: "Zoho Live Analytics", iconKind: "zoho", description: "Real-time sync" },
];

function NavContent({ onItemClick }: { onItemClick?: () => void }) {
  const { role, signOut, email } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = getAllowedModules(role);
  const items = NAV.filter((n) => allowed.includes(n.module));

  return (
    <>
      <div className="px-6 py-5 border-b border-border">
        <Logo size={44} withWordmark tagline="Analytics Suite" />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Modules
        </div>
        {items.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onItemClick}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                active
                  ? "bg-accent/10 text-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
              )}
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  active ? "bg-accent" : "bg-white border border-border group-hover:bg-secondary"
                )}
              >
                <ModuleIcon kind={item.iconKind} active={active} size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("font-medium truncate", active && "text-foreground")}>{item.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">{item.description}</div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3 space-y-2">
        <div className="flex items-center gap-2.5 rounded-lg bg-secondary/60 px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-semibold text-primary-foreground">
            {(email?.[0] ?? "U").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-foreground">{email ?? "User"}</div>
            <div className="text-[10px] text-muted-foreground">{role}</div>
          </div>
        </div>
        <button
          onClick={() => {
            signOut();
            navigate({ to: "/login" });
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-all hover:bg-secondary hover:shadow-soft"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-72 flex-col border-r border-border bg-sidebar">
      <NavContent />
    </aside>
  );
}

export function MobileNavTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0">
        <NavContent onItemClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
