import type { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import { getActionById } from "@/lib/actions-store";
// import 你的重試排程/服務…

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // ⬅️ Promise
) {
  try {
    const auth = await requireUserId(req);
    if (!auth)
      return jsonError("unauthorized", "Sign in required", { status: 401 });

    const { id: actionId } = await ctx.params; // ⬅️ await
    const action = getActionById(actionId);
    if (!action)
      return jsonError("not_found", "Action not found", { status: 404 });
    if (action.userId !== auth.userId) {
      return jsonError("forbidden", "You do not have access to this action", {
        status: 403,
      });
    }

    // TODO: 呼叫你的 retry 邏輯
    // await scheduleRetryFailed(actionId);

    return jsonOk({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return jsonError("internal_error", msg, { status: 500 });
  }
}
