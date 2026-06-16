import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, getAllowedModules } from "@/lib/auth-store";
import { ZohoModule } from "@/components/zoho/ZohoModule";

export const Route = createFileRoute("/_app/zoho")({
  component: Page,
});

function Page() {
  const role = useAuth((s) => s.role);
  if (!getAllowedModules(role).includes("zoho")) return <Navigate to="/data" />;
  return <ZohoModule />;
}
