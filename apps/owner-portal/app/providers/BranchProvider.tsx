"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider";
import { listBranches, type Branch } from "../services/branches";
import { setActiveBranchId } from "../services/branchContext";

function storageKey(tenantId: string) {
  return `bos_owner_active_branch_${tenantId}`;
}

interface BranchContextValue {
  // Every branch under the tenant the owner can switch into.
  branches: Branch[];
  activeBranchId: string | null;
  activeBranch: Branch | null;
  isLoading: boolean;
  switchBranch: (branchId: string) => void;
  // Reflects a branch rename (e.g. from the Receipt Designer's business
  // profile editor) into the local branch list immediately, without
  // waiting on a refetch — and without assuming the renamed branch is the
  // owner's own home branch.
  renameBranch: (branchId: string, name: string) => void;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { token, tenant, branch, isOwner } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token || !tenant || !branch || !isOwner) {
      setBranches([]);
      setActiveId(null);
      setActiveBranchId(null);
      return;
    }

    // Apply the remembered choice (or the account's home branch) right
    // away, synchronously, so requests fired this render already carry the
    // right branch instead of waiting on the branch list round-trip.
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(storageKey(tenant.id)) : null;
    const initial = stored ?? branch.id;
    setActiveId(initial);
    setActiveBranchId(initial);

    setIsLoading(true);
    listBranches(token)
      .then(({ branches: rows }) => {
        setBranches(rows);
        // The remembered branch may have since been removed/reassigned —
        // fall back to the home branch rather than pointing at nothing.
        if (!rows.some((b) => b.id === initial)) {
          setActiveId(branch.id);
          setActiveBranchId(branch.id);
        }
      })
      .catch(() => setBranches([]))
      .finally(() => setIsLoading(false));
  }, [token, tenant, branch, isOwner]);

  const switchBranch = useCallback(
    (branchId: string) => {
      if (!tenant) return;
      localStorage.setItem(storageKey(tenant.id), branchId);
      setActiveBranchId(branchId);
      // Dashboard pages each fetch their own data in a mount-time effect
      // keyed off the auth token, not the active branch — a reload is the
      // simplest way to make every one of them refetch under the newly
      // selected branch.
      window.location.reload();
    },
    [tenant],
  );

  const renameBranch = useCallback((branchId: string, name: string) => {
    setBranches((prev) => prev.map((b) => (b.id === branchId ? { ...b, name } : b)));
  }, []);

  const activeBranch = useMemo<Branch | null>(
    () => branches.find((b) => b.id === activeId) ?? (activeId === branch?.id ? branch : null),
    [branches, activeId, branch],
  );

  const value = useMemo<BranchContextValue>(
    () => ({ branches, activeBranchId: activeId, activeBranch, isLoading, switchBranch, renameBranch }),
    [branches, activeId, activeBranch, isLoading, switchBranch, renameBranch],
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error("useBranch must be used within BranchProvider");
  }
  return context;
}
