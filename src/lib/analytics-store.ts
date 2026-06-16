import { create } from "zustand";
import type { ParsedFile, LinkingFeature } from "./feature-linker";
import type { Filters } from "./sp-analytics";

export type StreamState = { files: ParsedFile[]; features: LinkingFeature[] };

interface AnalyticsState {
  sales: StreamState;
  purchase: StreamState;
  filters: Filters;
  setSales: (s: StreamState) => void;
  setPurchase: (s: StreamState) => void;
  setFilters: (f: Filters) => void;
  resetAll: () => void;
}

// Session-only (not persisted) — data stays as long as the app is open
// so navigating to other tabs preserves uploads.
export const useAnalytics = create<AnalyticsState>((set) => ({
  sales: { files: [], features: [] },
  purchase: { files: [], features: [] },
  filters: {},
  setSales: (sales) => set({ sales }),
  setPurchase: (purchase) => set({ purchase }),
  setFilters: (filters) => set({ filters }),
  resetAll: () => set({ sales: { files: [], features: [] }, purchase: { files: [], features: [] }, filters: {} }),
}));
