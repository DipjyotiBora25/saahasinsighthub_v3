import { createFileRoute } from "@tanstack/react-router";
import { DataAnalyticsModule } from "@/components/data/DataAnalyticsModule";

export const Route = createFileRoute("/_app/data")({
  component: DataAnalyticsModule,
});
