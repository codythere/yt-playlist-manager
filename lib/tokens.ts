// /lib/tokens.ts
import { db } from "@/lib/db";

/**
 * 你的 tokens table 假設如下（調整為你的真實 schema）：
 * CREATE TABLE IF NOT EXISTS tokens (
 *   user_id TEXT PRIMARY KEY,
 *   access_token TEXT,
 *   refresh_token TEXT,
 *   expiry_date INTEGER
 * );
 */

export async function getTokensByUserId(userId: string): Promise<{
  access_token?: string | null;
  refresh_token?: string | null;
} | null> {
  const row = db
    .prepare("SELECT access_token, refresh_token FROM tokens WHERE user_id = ?")
    .get(userId) as
    | { access_token?: string; refresh_token?: string }
    | undefined;

  if (!row) return null;
  return {
    access_token: row.access_token ?? null,
    refresh_token: row.refresh_token ?? null,
  };
}

export async function deleteTokensByUserId(userId: string) {
  db.prepare("DELETE FROM tokens WHERE user_id = ?").run(userId);
}
