// check-token.js
const path = require("path");
const Database = require("better-sqlite3");

// ⚠️ 確認與 lib/db.ts 一致的 DB 路徑
// 假如你的 lib/db.ts 是這樣： new Database("./db/data.sqlite3")
// 就保留下面這行：
const dbPath =
  process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), "db", "data.sqlite3");

console.log("DB absolute path:", dbPath);
const db = new Database(dbPath);

const rows = db.prepare("SELECT * FROM user_tokens").all();

console.log("=== user_tokens ===");
if (rows.length === 0) {
  console.log("⚠️ 資料表是空的，尚未儲存任何 Google token。");
} else {
  for (const r of rows) {
    console.log({
      user_id: r.user_id,
      access_token: r.access_token ? r.access_token.slice(0, 25) + "..." : null,
      refresh_token: r.refresh_token
        ? r.refresh_token.slice(0, 25) + "..."
        : null,
      expiry_date: r.expiry_date,
      updated_at: r.updated_at,
    });
  }
}
