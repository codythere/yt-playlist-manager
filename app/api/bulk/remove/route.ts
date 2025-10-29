// app/api/bulk/remove/route.ts
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { jsonError, jsonOk } from "@/lib/result";
import { bulkRemoveSchema } from "@/validators/bulk";
import { performBulkRemove, getActionSummary } from "@/lib/actions-service";
import { checkIdempotencyKey, registerIdempotencyKey } from "@/lib/idempotency";
import { requireUserId } from "@/lib/auth";
import { getUserTokens } from "@/lib/google";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** 只取 userId（字串），避免型別不合 */
async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  // 1) 先走你現有的 requireUserId（會回 { userId, email } | null）
  try {
    const u = await requireUserId(req as any);
    if (u?.userId) return u.userId; // ✅ 取字串，不回物件
  } catch {}

  // 2) 保底：直接從 headers cookies() 解析 ytpm_session
  try {
    const store = await cookies(); // 你的專案型別下是 Promise
    const raw = store.get("ytpm_session")?.value;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.userId) return String(parsed.userId);
    }
  } catch {}

  // 3) 若有自訂 header（測試用）
  const hdr = req.headers.get("x-user-id");
  if (hdr) return hdr;

  return null;
}

export async function POST(request: NextRequest) {
  // ---- 讀 body ----
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON body", { status: 400 });
  }

  // ---- 驗證 payload ----
  const parsed = bulkRemoveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", parsed.error.message, { status: 400 });
  }
  const payload = parsed.data;

  // ---- userId from cookie/session ----
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }

  // ---- 先檢查 tokens 是否存在（避免進 service 才 fallback）----
  const tokens = await getUserTokens(userId);
  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    logger.warn({ userId }, "[bulk/remove] no tokens");
    return jsonError(
      "no_tokens",
      "YouTube authorization missing or expired. Please sign in",
      { status: 400 }
    );
  }

  // ---- 冪等鍵 ----
  const idemKey =
    request.headers.get("idempotency-key") ??
    payload.idempotencyKey ??
    undefined;

  if (idemKey && checkIdempotencyKey(idemKey)) {
    const summary = getActionSummary(idemKey);
    if (summary && summary.action.userId === userId) {
      return jsonOk({
        ...summary,
        estimatedQuota: payload.playlistItemIds.length * 50,
        idempotent: true,
      });
    }
  }

  // ---- 執行 ----
  const result = await performBulkRemove(payload, {
    userId,
    actionId: idemKey,
  });

  if (idemKey) registerIdempotencyKey(idemKey);

  return jsonOk({ ...result, idempotent: false });
}
