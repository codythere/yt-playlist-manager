// /app/api/actions/[id]/undo/route.ts
import type { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import { getActionSummary } from "@/lib/actions-service"; // 你原本就有用到的函式（如名稱不同，改成你的）

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // ✅ params 是 Promise
) {
  try {
    const auth = await requireUserId(req);
    if (!auth) {
      return jsonError("unauthorized", "Sign in required", { status: 401 });
    }

    const { id: actionId } = await ctx.params; // ✅ 必須 await
    const summary = getActionSummary(actionId);
    if (!summary || summary.action.userId !== auth.userId) {
      return jsonError("not_found", "Action not found", { status: 404 });
    }

    // TODO: 在這裡呼叫你的實際 undo 邏輯（排程/工作佇列等）
    // await scheduleUndo(actionId);

    return jsonOk({ ok: true }); // 或回傳你需要的資料
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return jsonError("internal_error", msg, { status: 500 });
  }
}
