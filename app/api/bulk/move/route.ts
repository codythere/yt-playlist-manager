// /app/api/bulk/move/route.ts
import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/result";
import { bulkMoveSchema } from "@/validators/bulk";
import { performBulkMove, getActionSummary } from "@/lib/actions-service";
import { checkIdempotencyKey, registerIdempotencyKey } from "@/lib/idempotency";
import { requireUserId } from "@/lib/auth";
import { getYouTubeClientEx } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1) 讀 body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON body", { status: 400 });
  }

  const parsed = bulkMoveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", parsed.error.message, { status: 400 });
  }
  const payload = parsed.data;

  // 2) 讀取 session（一定要 await，並把 request 傳入）
  const auth = await requireUserId(request);
  if (!auth) {
    // 方便除錯：把目前 request 看到的 cookies 印出來
    console.log("[bulk/move] no session, cookies=", request.cookies.getAll());
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }
  const userId = auth.userId;
  console.log("[bulk/move] userId:", userId);

  // 3) 確認 token 存在（沒有就回 no_tokens）
  try {
    const { yt, mock } = await getYouTubeClientEx({
      userId,
      requireReal: true,
    });
    if (!yt || mock) {
      return jsonError(
        "no_tokens",
        "YouTube authorization missing or expired. Please sign in again.",
        { status: 400 }
      );
    }
  } catch (err: any) {
    console.error(
      "[bulk/move] getYouTubeClientEx error:",
      err?.code,
      err?.message
    );
    const code = err?.code === "NO_TOKENS" ? "no_tokens" : "internal_error";
    const status = err?.code === "NO_TOKENS" ? 400 : 500;
    return jsonError(code, err?.message ?? "Failed to init YouTube client", {
      status,
    });
  }

  // 4) 冪等處理
  const idempotencyKey =
    request.headers.get("idempotency-key") ??
    payload.idempotencyKey ??
    undefined;

  if (idempotencyKey && checkIdempotencyKey(idempotencyKey)) {
    const summary = getActionSummary(idempotencyKey);
    if (summary && summary.action.userId === userId) {
      return jsonOk({
        ...summary,
        estimatedQuota: payload.items.length * 100,
        idempotent: true,
      });
    }
  }

  // 5) 執行
  const result = await performBulkMove(payload, {
    userId,
    actionId: idempotencyKey,
  });
  if (idempotencyKey) registerIdempotencyKey(idempotencyKey);

  return jsonOk({ ...result, idempotent: false });
}
