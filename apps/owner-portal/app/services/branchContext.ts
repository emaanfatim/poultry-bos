// Holds the owner's currently-selected branch outside of React so the api
// client (services/api.ts) can read it synchronously on every request
// without every one of the ~50 call sites needing to accept and pass a
// branchId. BranchProvider is the only writer; it keeps this in sync with
// its own React state and with localStorage.
let activeBranchId: string | null = null;

export function setActiveBranchId(id: string | null) {
  activeBranchId = id;
}

export function getActiveBranchId(): string | null {
  return activeBranchId;
}
