import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, getAllowedModules } from "@/lib/auth-store";
import { PowerBIModule } from "@/components/powerbi/PowerBIModule";

export const Route = createFileRoute("/_app/powerbi")({
  component: Page,
});

function Page() {
  const role = useAuth((s) => s.role);
  if (!getAllowedModules(role).includes("powerbi")) return <Navigate to="/data" />;
  return <PowerBIModule />;
}
