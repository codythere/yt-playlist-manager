// /app/api/actions/route.ts
import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { listActionsPageSafe, getActionCounts } from "@/lib/actions-store";
import { jsonOk, jsonError } from "@/lib/result";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limitNum = Number(limitRaw ?? 20);
    const limit = Math.max(
      1,
      Math.min(100, Number.isFinite(limitNum) ? limitNum : 20)
    );
    const cursor = url.searchParams.get("cursor") || undefined;

    // ✅ 明確記錄
    console.log(
      "[/api/actions] using listActionsPageSafe; limit, cursor =",
      limit,
      cursor
    );

    const auth = await requireUserId(request);
    if (!auth) {
      return jsonError("unauthorized", "Sign in to continue", { status: 401 });
    }

    // ✅ 用安全版（普通 ? 佔位）
    const actions = await listActionsPageSafe(auth.userId, limit + 1, cursor);
    const hasMore = actions.length > limit;
    const page = hasMore ? actions.slice(0, limit) : actions;

    // 相容未來非同步
    const data = await Promise.all(
      page.map(async (action) => ({
        action,
        counts: await getActionCounts(action.id),
      }))
    );

    return jsonOk({
      actions: data,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/actions] error:", err);
    return jsonError("internal_error", message, { status: 500 });
  }
}
