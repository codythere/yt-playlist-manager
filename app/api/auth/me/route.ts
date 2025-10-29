// /app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { resolveAuthContext } from "@/lib/auth";
// 若你未來要根據 token 狀態回報更多資訊，可引入 getUserTokens
// import { getUserTokens } from "@/lib/google";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // 透過 lib/auth 的統一邏輯取得 session（會從 cookies 解析）
  const ctx = await resolveAuthContext();

  // 回傳給前端 HomeClient 期望的 AuthState 形狀
  const body = {
    authenticated: !!ctx.loggedIn,
    userId: ctx.loggedIn ? ctx.userId : null,
    email: ctx.loggedIn ? ctx.email ?? null : null,
    // 目前所有寫入都要求真實 API，這裡一律回 false，避免 UI 誤以為可在未登入時讀取
    usingMock: false,
  };

  const res = NextResponse.json(body, { status: 200 });
  // 強制不要快取，清 cookie 後就能立即反映未登入狀態
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
