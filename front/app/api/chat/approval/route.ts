import { settleApprovalRequest } from "../approvals";

type ApprovalDecision = {
  id?: string;
  approved?: boolean;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ApprovalDecision;

  if (!body.id || typeof body.approved !== "boolean") {
    return Response.json({ error: "Approval id and approved are required" }, { status: 400 });
  }

  const settled = settleApprovalRequest(body.id, body.approved);

  if (!settled) {
    return Response.json({ error: "Approval request not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
