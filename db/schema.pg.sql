-- db/schema.pg.sql  將此檔在 Postgres 執行（Render PG/Neon/Supabase 皆可）

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT CHECK(type IN ('ADD','REMOVE','MOVE','UNDO')),
  source_playlist_id TEXT,
  target_playlist_id TEXT,
  status TEXT CHECK(status IN ('pending','running','success','partial','failed')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  parent_action_id TEXT
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  action_id TEXT REFERENCES actions(id) ON DELETE CASCADE,
  type TEXT,
  video_id TEXT,
  source_playlist_id TEXT,
  target_playlist_id TEXT,
  source_playlist_item_id TEXT,
  target_playlist_item_id TEXT,
  position INTEGER,
  status TEXT CHECK(status IN ('pending','success','failed')) DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actions_user_created_at ON actions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_items_action ON action_items(action_id);

CREATE TABLE IF NOT EXISTS oauth_credentials (
  user_id TEXT PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expiry_date BIGINT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 這兩個表是程式碼動態建立的（你專案裡用到），先明確建立起來：
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id TEXT PRIMARY KEY,
  access_token  TEXT,
  refresh_token TEXT,
  scope         TEXT,
  token_type    TEXT,
  expiry_date   BIGINT,
  id_token      TEXT,
  updated_at    BIGINT
);

CREATE TABLE IF NOT EXISTS tokens (
  user_id TEXT PRIMARY KEY,
  access_token  TEXT,
  refresh_token TEXT,
  expiry_date   BIGINT
);

-- 配額儲存（原 quota-db.ts 內建）：PG 版提前建立
CREATE TABLE IF NOT EXISTS quota_usage (
  date_key TEXT NOT NULL,
  scope    TEXT NOT NULL,
  used     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date_key, scope)
);

CREATE TABLE IF NOT EXISTS quota_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_quota_scope_date ON quota_usage(scope, date_key);
