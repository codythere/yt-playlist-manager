// /app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { deleteTokensByUserId, getTokensByUserId } from "@/lib/tokens";
import { revokeRefreshToken, revokeAccessToken } from "@/lib/google-revoke";

export const dynamic = "force-dynamic";

/**
 * POST：前端 fetch 登出
 */
export async function POST() {
  try {
    // 1) 取得目前登入使用者（你若已有其它方法，沿用即可）
    const user = await getCurrentUser(); // 需回傳 { id: string } or null
    const userId = user?.id ?? null;

    // 2) 取出 DB 內 token（若需要 revoke）
    const tokens = userId ? await getTokensByUserId(userId) : null;

    // 3) 先嘗試 revoke（不阻塞流程）
    try {
      if (tokens?.refresh_token) {
        await revokeRefreshToken(tokens.refresh_token);
      }
      // access_token 通常快過期，可選
      if (tokens?.access_token) {
        await revokeAccessToken(tokens.access_token);
      }
    } catch {
      // 忽略 revoke 失敗
    }

    // 4) 清 DB（依 userId）
    if (userId) {
      await deleteTokensByUserId(userId);
    }

    // 5) 清 Cookie
    await clearSessionCookie();

    return NextResponse.json(
      { ok: true, data: { success: true } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "logout_failed" },
      { status: 500 }
    );
  }
}

/**
 * GET：也支援直接導向
 */
export async function GET() {
  await clearSessionCookie();
  return NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
