import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Role = "Admin" | "Accounts" | "Sales" | "Purchase";

export type Module = "data" | "powerbi" | "zoho";

interface AuthState {
  role: Role | null;
  email: string | null;
  signIn: (email: string, role: Role) => void;
  signOut: () => void;
}

const safeStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return window.localStorage;
});

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      role: null,
      email: null,
      signIn: (email, role) => set({ email, role }),
      signOut: () => set({ email: null, role: null }),
    }),
    { name: "saahas-auth", storage: safeStorage, skipHydration: true }
  )
);

if (typeof window !== "undefined") {
  void useAuth.persist.rehydrate();
}

export function getAllowedModules(role: Role | null): Module[] {
  switch (role) {
    case "Admin":
    case "Accounts":
      return ["data", "powerbi", "zoho"];
    case "Sales":
      return ["data", "powerbi"];
    case "Purchase":
      return ["data"];
    default:
      return [];
  }
}

export function getRoleTier(role: Role | null): string {
  if (!role) return "";
  if (role === "Admin") return "Admin Tier";
  if (role === "Accounts") return "Finance Tier";
  if (role === "Sales") return "Sales Tier";
  return "Ops Tier";
}

export type Permission = "read" | "write" | "delete";

const PERMISSIONS: Record<Role, Permission[]> = {
  Admin: ["read", "write", "delete"],
  Accounts: ["read", "write"],
  Sales: ["read"],
  Purchase: ["read", "write"],
};

export function getPermissions(role: Role | null): Permission[] {
  return role ? PERMISSIONS[role] : [];
}

export function can(role: Role | null, perm: Permission): boolean {
  return getPermissions(role).includes(perm);
}
