// /api/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getEmailFromTokens,
  saveUserTokens,
  isGoogleConfigured,
} from "@/lib/google";

export const dynamic = "force-dynamic";

/** 避免 JSON.parse 失敗直接爆掉的小工具 */
function safeParseJSON<T = any>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 嘗試從 id_token 取 sub（作為穩定 userId 後備） */
function getSubFromIdToken(idToken?: string | null): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(
        parts[1].replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      ).toString("utf8")
    );
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // A) 基本檢查：Google OAuth 是否已設定
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "misconfigured",
        message:
          "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
      },
      { status: 500 }
    );
  }

  // B) Google 端回傳的錯誤
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.json(
      { ok: false, error: "oauth_error", message: oauthError },
      { status: 400 }
    );
  }

  // C) 取得 code
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "invalid_request", message: 'Missing "code"' },
      { status: 400 }
    );
  }

  // D) 解析 state（可帶 redirect）
  const rawState = url.searchParams.get("state");
  const stateObj = safeParseJSON<{ redirect?: string }>(rawState) ?? {};
  const redirectTarget =
    stateObj.redirect && stateObj.redirect.startsWith("/")
      ? stateObj.redirect
      : "/";

  try {
    // 1) 交換 tokens
    const tokens = await exchangeCodeForTokens(code);

    // 2) 取 email 當 userId（拿不到就退而求其次用 id_token.sub）
    const email = await getEmailFromTokens(tokens);
    const sub = getSubFromIdToken(tokens.id_token ?? null);
    const userId = email ?? sub;

    if (!userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "identity_unavailable",
          message: "Unable to resolve user identity (email/sub).",
        },
        { status: 502 }
      );
    }

    // 3) 存 tokens（你的 saveUserTokens 會保留舊 refresh_token）
    await saveUserTokens(userId, tokens);

    // 4) 設 session cookie（含 userId 與 email，供 /api/auth/me 使用）
    const res = NextResponse.redirect(new URL(redirectTarget, req.url), {
      status: 302,
    });
    res.cookies.set(
      "ytpm_session",
      JSON.stringify({ userId, email: email ?? null, authenticated: true }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        // 7 天
        expires: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      }
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "google_api_error",
        message: err?.message ?? "OAuth callback failed",
      },
      { status: 502 }
    );
  }
}
