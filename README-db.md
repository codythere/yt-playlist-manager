# 🗄️ YouTube Playlist Manager — Database Setup Guide

This document explains how to initialize and use the PostgreSQL database for this project, including Neon cloud setup, environment variables, schema creation, and verification steps.

# 1. Database Options

You can run the database in 2 ways:

✅ Preferred: Neon (Cloud Postgres)

Free, serverless, auto-suspend, great for hobby projects.

🏠 Local Postgres (optional)

Good for offline development or heavy debugging.

Project supports both, depending on your DATABASE_URL.

# 2. Environment Variables

Create or update .env.local:

DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DBNAME"

⚠ Neon URLs always require SSL

Our lib/db.ts will auto-enable SSL when the URL contains neon.tech.

# 3. Setting up a Neon Database

# 3.1 Create a Neon project

Go to: https://neon.tech

Click Create Project

Recommended settings:

Option Value
Project name ytpm-postgres
Postgres version 17
Provider AWS
Region any US region (lowest latency to Vercel/Render)
Enable Neon Auth ❌ Off（你已有自己的 auth system）

Click Create.

# 3.2 Copy your connection string

In “Connection Details” choose → Include password
Copy the psql connection URL.

Paste into .env.local:

DATABASE_URL="postgres://..."

# 4. Initialize DB schema

The project includes a full Postgres schema at:

db/schema.pg.sql

Run it once in Neon Console or any SQL client:

方法 A（Neon Web Console — 最推薦）

Open Neon → SQL Editor

Paste entire schema.pg.sql

Execute

# 5. Test the connection

Create a test script at scripts/test-db.ts:

import { query } from "@/lib/db";

async function main() {
try {
const r = await query("SELECT now()");
console.log("DB OK:", r.rows[0]);
} catch (e) {
console.error("DB ERROR:", e);
}
}

main();

Run:

npx tsx scripts/test-db.ts

如果看到：

DB OK: { now: 2025-11-13T... }

就表示 DB 成功連線。

# 6. Verify all required tables exist

After schema import, run:

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

你應該會看到：

actions

action_items

user_tokens

tokens

quota_usage

quota_meta

oauth_tokens

oauth_credentials

idempotency_keys

If any table is missing, re-run schema.pg.sql.

# 7. Running the app

Once DB is ready：

npm run dev

測試端點：

/api/actions

/api/bulk/add

/api/playlists

OAuth login → 應該會寫入 user_tokens table。

# 8. Deployment Notes (Vercel / Render)

Neon → Always SSL

已由 lib/db.ts 自動處理，不需額外設定。

If deploying to Render:

環境變數設定同本機（複製 .env.local）。

# 9. Team Collaboration Guidelines

✔ 不要手動在 DB 上亂動 schema → 請統一使用 schema.pg.sql
✔ 新增表格請同步更新 schema.pg.sql
✔ 不要 commit 個人本機 .env.local
✔ Neon DB 適合 staging / prod — 不適合跑重負載
✔ 如果未來加入 Prisma，再補上 schema.prisma 管理方式

# 10. Troubleshooting

❗ ERROR: relation "actions" does not exist

代表你沒執行 schema.pg.sql。

❗ self-signed certificate error

表示你不是在使用 Neon
→ 改用本機 Postgres
→ 或檢查 lib/db.ts 的 SSL 判斷邏輯。

❗ no_tokens

代表 OAuth 未登入或 token 過期
→ 點 Login with Google 再試。

# 11. FAQ

Q: 是否需要 Prisma？

A: 不需要，目前是純 SQL 模式，效能與可控性更高。
