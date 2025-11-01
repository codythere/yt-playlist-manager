// lib/auth.ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "ytpm_session";

export type Session = {
  userId: string;
  email?: string | null;
  authenticated?: boolean;
};

export type AuthUser = {
  id: string;
  email: string | null;
};

function parseSession(raw: string | undefined | null): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s?.userId ? (s as Session) : null;
  } catch {
    return null;
  }
}

/** 從 headers cookies() 讀取（非 Route Handler 也可用） */
export async function getSessionFromCookies(): Promise<Session | null> {
  const store = await cookies(); // 你的專案型別下是 Promise
  return parseSession(store.get(SESSION_COOKIE)?.value ?? null);
}

/** （舊函式，保留相容） */
export async function getSession(): Promise<Session | null> {
  return getSessionFromCookies();
}

/**
 * 只回傳使用者 ID（string | null）
 * Route handler 推薦使用這個，避免回傳物件造成型別錯。
 */
export async function getUserIdFromRequest(
  req?: NextRequest
): Promise<string | null> {
  // 1) 若有 NextRequest：先讀同步 cookies（最快）
  if (req) {
    try {
      const raw = req.cookies.get(SESSION_COOKIE)?.value ?? null;
      const s = parseSession(raw);
      if (s?.userId) return String(s.userId);
    } catch {}
  }

  // 2) 再退回 headers cookies()（在你的型別下是 Promise）
  try {
    const store = await cookies();
    const s = parseSession(store.get(SESSION_COOKIE)?.value ?? null);
    if (s?.userId) return String(s.userId);
  } catch {}

  // 3) 最後看是否有自訂 header（例如測試/反向代理時）
  if (req) {
    const hdr = req.headers.get("x-user-id");
    if (hdr) return hdr;
  }

  return null;
}

/** 提供 Route handler 使用；從 NextRequest 或 headers 讀取（回傳物件版） */
export async function requireUserId(
  req?: NextRequest
): Promise<{ userId: string; email: string | null } | null> {
  if (req) {
    // NextRequest.cookies 是同步的
    const raw = req.cookies.get(SESSION_COOKIE)?.value ?? null;
    const s = parseSession(raw);
    return s?.userId
      ? { userId: String(s.userId), email: s.email ?? null }
      : null;
  } else {
    // headers cookies() 在你的專案型別下是 Promise
    const store = await cookies();
    const s = parseSession(store.get(SESSION_COOKIE)?.value ?? null);
    return s?.userId
      ? { userId: String(s.userId), email: s.email ?? null }
      : null;
  }
}

/**
 * ✅ 新增：取得目前登入使用者（回傳 { id, email }）
 * - 會優先用 NextRequest 讀同步 cookie；否則退回 headers cookies()
 * - 失敗時回傳 null
 */
export async function getCurrentUser(
  req?: NextRequest
): Promise<AuthUser | null> {
  const hit =
    (await requireUserId(req)) ??
    // 保底再掃一次（避免上面意外失敗）
    (await (async () => {
      try {
        const store = await cookies();
        const s = parseSession(store.get(SESSION_COOKIE)?.value ?? null);
        return s?.userId
          ? { userId: String(s.userId), email: s.email ?? null }
          : null;
      } catch {
        return null;
      }
    })());

  return hit ? { id: hit.userId, email: hit.email } : null;
}

/** 設定 cookie */
export async function setSessionCookie(
  value: string,
  opts?: { expires?: Date }
) {
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...opts,
  });
}

/**
 * 清除 cookie
 * - 預設只清 `ytpm_session`
 * - 可傳入額外 cookie 名稱一起清（例如 access_token / refresh_token 等）
 */
export async function clearSessionCookie(extraNames: string[] = []) {
  const store = await cookies();
  store.delete(SESSION_COOKIE);

  // 若想一併清除 OAuth 相關 cookie，可在呼叫端傳入：
  // clearSessionCookie(["access_token", "refresh_token", "google_oauth_state", "google_oauth_verifier"])
  for (const name of extraNames) {
    try {
      store.delete(name);
    } catch {
      /* ignore single delete failure */
    }
  }
}

/** 供 /api/auth/me 使用 */
export async function resolveAuthContext() {
  const s = await getSessionFromCookies();
  return s?.userId
    ? {
        loggedIn: true,
        authenticated: true,
        userId: s.userId,
        email: s.email ?? null,
      }
    : { loggedIn: false, authenticated: false, userId: null, email: null };
}
