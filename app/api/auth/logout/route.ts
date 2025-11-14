// /app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { deleteTokensByUserId, getTokensByUserId } from "@/lib/tokens";
import { revokeRefreshToken, revokeAccessToken } from "@/lib/google-revoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST：純粹執行登出與清理，回傳 JSON（不做 redirect）
 * 若你將來仍要用 POST 方式，也不會造成雙重導向。
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    const userId = user?.id ?? null;

    let tokens: {
      access_token?: string | null;
      refresh_token?: string | null;
    } | null = null;
    if (userId) {
      try {
        tokens = await getTokensByUserId(userId);
      } catch (e) {
        console.error("[logout] getTokensByUserId failed:", e);
      }
    }

    try {
      if (tokens?.refresh_token) await revokeRefreshToken(tokens.refresh_token);
      if (tokens?.access_token) await revokeAccessToken(tokens.access_token);
    } catch (e) {
      console.warn("[logout] revoke token failed:", e);
    }

    if (userId) {
      try {
        await deleteTokensByUserId(userId);
      } catch (e) {
        console.error("[logout] deleteTokensByUserId failed:", e);
      }
    }

    await clearSessionCookie([
      "access_token",
      "refresh_token",
      "google_oauth_state",
      "google_oauth_verifier",
      "ytpm_uid",
    ]);

    return NextResponse.json(
      { ok: true, data: { success: true } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("[logout] fatal:", e);
    return NextResponse.json(
      { ok: false, error: "logout_failed", detail: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * GET：執行登出與清理，並「只做一次」伺服器端 redirect。
 * 支援 ?next=，預設導向 /login。
 */
export async function GET(request: Request) {
  await clearSessionCookie([
    "access_token",
    "refresh_token",
    "google_oauth_state",
    "google_oauth_verifier",
    "ytpm_uid",
  ]);

  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/login";

  return NextResponse.redirect(
    new URL(next, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
