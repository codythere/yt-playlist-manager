// /api/bulk/add/route.ts
import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/result";
import { bulkAddSchema } from "@/validators/bulk";
import { performBulkAdd, getActionSummary } from "@/lib/actions-service";
import { checkIdempotencyKey, registerIdempotencyKey } from "@/lib/idempotency";
import { requireUserId } from "@/lib/auth";
import { getYouTubeClientEx } from "@/lib/google"; // ✅ 新增這行

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON body", { status: 400 });
  }

  const parseResult = bulkAddSchema.safeParse(body);
  if (!parseResult.success) {
    return jsonError("invalid_request", parseResult.error.message, {
      status: 400,
    });
  }

  const payload = parseResult.data;
  const auth = requireUserId();
  if (!auth) {
    return jsonError("unauthorized", "Sign in to continue", { status: 401 });
  }

  const userId = auth.userId;
  const idempotencyKey =
    request.headers.get("idempotency-key") ??
    payload.idempotencyKey ??
    undefined;

  // ✅ 驗證是否有有效 token（嚴格模式）
  try {
    const { yt, mock } = await getYouTubeClientEx({
      userId,
      requireReal: true,
    });
    if (!yt || mock) {
      return jsonError(
        "no_tokens",
        "No valid Google OAuth tokens found. Please sign in again.",
        { status: 400 }
      );
    }
  } catch (err: any) {
    if (err.code === "NO_TOKENS") {
      return jsonError(
        "no_tokens",
        "YouTube authorization missing or expired. Please sign in again.",
        { status: 400 }
      );
    }
    console.error("[bulk/add] getYouTubeClientEx error:", err);
    return jsonError("internal_error", "Failed to initialize YouTube client.", {
      status: 500,
    });
  }

  // ✅ 確保 idempotency key
  if (idempotencyKey && checkIdempotencyKey(idempotencyKey)) {
    const summary = getActionSummary(idempotencyKey);
    if (summary && summary.action.userId === userId) {
      return jsonOk({
        ...summary,
        estimatedQuota: payload.videoIds.length * 50,
        idempotent: true,
      });
    }
  }

  // ✅ 真正執行 bulk add
  const result = await performBulkAdd(payload, {
    userId,
    actionId: idempotencyKey,
  });

  if (idempotencyKey) {
    registerIdempotencyKey(idempotencyKey);
  }

  return jsonOk({
    ...result,
    idempotent: false,
  });
}
