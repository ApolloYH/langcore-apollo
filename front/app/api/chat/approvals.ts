type PendingApproval = {
  resolve: (approved: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const APPROVAL_TTL_MS = 5 * 60 * 1000;

type ApprovalGlobal = typeof globalThis & {
  __langcoreApprovals?: Map<string, PendingApproval>;
};

function approvalStore() {
  const globalStore = globalThis as ApprovalGlobal;
  globalStore.__langcoreApprovals ??= new Map<string, PendingApproval>();
  return globalStore.__langcoreApprovals;
}

export function createApprovalRequest() {
  const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let resolver: (approved: boolean) => void = () => {};

  const promise = new Promise<boolean>((resolve) => {
    resolver = resolve;
  });

  const timeout = setTimeout(() => {
    settleApprovalRequest(id, false);
  }, APPROVAL_TTL_MS);

  approvalStore().set(id, { resolve: resolver, timeout });
  return { id, promise };
}

export function settleApprovalRequest(id: string, approved: boolean) {
  const pending = approvalStore().get(id);

  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeout);
  approvalStore().delete(id);
  pending.resolve(approved);
  return true;
}
