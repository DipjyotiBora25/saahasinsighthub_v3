import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-store";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { AnalyticsChat } from "@/components/chat/AnalyticsChat";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const role = useAuth((s) => s.role);
  if (!role) return <Navigate to="/login" />;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <AppHeader />
        <main className="flex-1 overflow-x-hidden p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px] animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>
      <AnalyticsChat />
    </div>
  );
}
