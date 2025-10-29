// lib/google.ts
import "server-only";
import { google } from "googleapis";
import type { OAuth2Client, Credentials } from "google-auth-library";
import type { youtube_v3 } from "googleapis";
import { db } from "./db";
import { logger } from "./logger";

const {
  GOOGLE_CLIENT_ID = "",
  GOOGLE_CLIENT_SECRET = "",
  GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/callback",
} = process.env;

/** DB row 型別（對應 user_tokens 資料表） */
export interface StoredTokens {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: number | null; // epoch ms
  id_token: string | null;
  updated_at: number | null; // epoch ms
}

export function isGoogleConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
}

function getOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/** 產生 Google OAuth 登入網址（給 /api/auth/login 使用） */
export function buildAuthUrl(state: string): string | null {
  if (!isGoogleConfigured()) return null;
  const oauth2 = getOAuthClient();
  const scopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    // 需要寫入動作就用 youtube；只讀可改 youtube.readonly
    "https://www.googleapis.com/auth/youtube",
  ];
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // 需要 refresh_token
    include_granted_scopes: true,
    scope: scopes,
    state,
  });
}

/** 交換 code → tokens */
export async function exchangeCodeForTokens(
  code: string
): Promise<Credentials> {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

/** 從 tokens 取 email（當作 userId） */
export async function getEmailFromTokens(
  tokens: Credentials
): Promise<string | null> {
  const oauth2 = getOAuthClient();
  oauth2.setCredentials(tokens);
  const oauth = google.oauth2("v2");
  const me = await oauth.userinfo.get({ auth: oauth2 as any });
  return me.data.email ?? null;
}

/** 初始化資料表（若不存在） */
function ensureTokenTable() {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS user_tokens (
      user_id       TEXT PRIMARY KEY,
      access_token  TEXT,
      refresh_token TEXT,
      scope         TEXT,
      token_type    TEXT,
      expiry_date   INTEGER,
      id_token      TEXT,
      updated_at    INTEGER
    )
  `
  ).run();
}

/** 儲存使用者 tokens（有則更新；refresh_token 若沒回傳則保留舊值） */
export async function saveUserTokens(
  userId: string,
  tokens: Credentials
): Promise<void> {
  ensureTokenTable();
  db.prepare(
    `
    INSERT INTO user_tokens (user_id, access_token, refresh_token, scope, token_type, expiry_date, id_token, updated_at)
    VALUES (@user_id, @access_token, @refresh_token, @scope, @token_type, @expiry_date, @id_token, @updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, user_tokens.refresh_token),
      scope         = excluded.scope,
      token_type    = excluded.token_type,
      expiry_date   = excluded.expiry_date,
      id_token      = excluded.id_token,
      updated_at    = excluded.updated_at
  `
  ).run({
    user_id: userId,
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.token_type ?? null,
    expiry_date: tokens.expiry_date ?? null,
    id_token: tokens.id_token ?? null,
    updated_at: Date.now(),
  });
}

/** 讀回使用者 tokens；不存在回 null */
export async function getUserTokens(
  userId: string
): Promise<StoredTokens | null> {
  ensureTokenTable();
  const row = db
    .prepare(`SELECT * FROM user_tokens WHERE user_id = ?`)
    .get(userId) as StoredTokens | undefined;
  return row ?? null;
}

/* =========================================================
 *   YouTube Client 取得：提供「一般」與「嚴格」兩種介面
 * ========================================================= */

/**
 * 延伸版（推薦在 API 端使用）：
 * - 有 token 時：回 { yt, mock: false }
 * - 無 token 時：
 *   - requireReal=true → throw { code: "NO_TOKENS" }
 *   - requireReal=false → 回 { yt: null, mock: true } 並警告 log（方便在列表讀取等非關鍵流程 fallback）
 */
export async function getYouTubeClientEx(opts: {
  userId: string;
  requireReal?: boolean;
}): Promise<{ yt: youtube_v3.Youtube | null; mock: boolean }> {
  const { userId, requireReal } = opts;

  try {
    const row = await getUserTokens(userId);

    if (!row || (!row.access_token && !row.refresh_token)) {
      const msg = "getYouTubeClient: no tokens found";
      if (requireReal) {
        const err: any = new Error(msg);
        err.code = "NO_TOKENS";
        throw err;
      } else {
        logger.warn({ userId }, `${msg}, falling back to mock`);
        return { yt: null, mock: true };
      }
    }

    const oauth2 = getOAuthClient();
    oauth2.setCredentials({
      access_token: row.access_token ?? undefined,
      refresh_token: row.refresh_token ?? undefined,
      expiry_date: row.expiry_date ?? undefined,
    });

    // 自動刷新 → 寫回 DB
    oauth2.on("tokens", async (t) => {
      try {
        const merged: Credentials = {
          access_token: t.access_token ?? row.access_token ?? undefined,
          refresh_token: t.refresh_token ?? row.refresh_token ?? undefined,
          scope: t.scope ?? row.scope ?? undefined,
          token_type: t.token_type ?? row.token_type ?? undefined,
          expiry_date: t.expiry_date ?? row.expiry_date ?? undefined,
          id_token: t.id_token ?? row.id_token ?? undefined,
        };
        await saveUserTokens(userId, merged);
      } catch (e) {
        logger.error({ e, userId }, "failed to persist refreshed tokens");
      }
    });

    const yt = google.youtube({ version: "v3", auth: oauth2 });
    return { yt, mock: false };
  } catch (err: any) {
    // 嚴格模式下的錯誤直接往上丟；一般模式回 mock
    if (err?.code === "NO_TOKENS") throw err;

    logger.error(
      { err, userId: opts.userId },
      "getYouTubeClient failed; falling back to mock"
    );
    if (opts.requireReal) throw err; // 嚴格模式不要 fallback
    return { yt: null, mock: true };
  }
}

/**
 * 相容舊介面（保持你現有程式不爆）：
 * - 有 token：回 youtube client
 * - 無 token：回 null（等同以前的行為）
 */
export async function getYouTubeClient(
  userId: string
): Promise<youtube_v3.Youtube | null> {
  const { yt } = await getYouTubeClientEx({ userId, requireReal: false });
  return yt;
}
