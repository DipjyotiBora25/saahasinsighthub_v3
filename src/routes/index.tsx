import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const role = useAuth((s) => s.role);
  return <Navigate to={role ? "/data" : "/login"} />;
}
