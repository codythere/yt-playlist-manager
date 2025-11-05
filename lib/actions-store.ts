import { nanoid } from "nanoid";
import { db } from "./db";
import type {
  ActionCounts,
  ActionItemRecord,
  ActionItemStatus,
  ActionRecord,
  ActionStatus,
  ActionType,
} from "@/types/actions";

interface ActionRow {
  id: string;
  user_id: string;
  type: ActionType;
  source_playlist_id: string | null;
  target_playlist_id: string | null;
  status: ActionStatus;
  created_at: string;
  finished_at: string | null;
  parent_action_id: string | null;
}

interface ActionItemRow {
  id: string;
  action_id: string;
  type: ActionType;
  video_id: string | null;
  source_playlist_id: string | null;
  target_playlist_id: string | null;
  source_playlist_item_id: string | null;
  target_playlist_item_id: string | null;
  position: number | null;
  status: ActionItemStatus;
  error_code: string | null;
  error_message: string | null;
}

const insertActionStmt = db.prepare(
  `INSERT INTO actions (
    id,
    user_id,
    type,
    source_playlist_id,
    target_playlist_id,
    status,
    created_at,
    parent_action_id
  ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`
);

const updateActionStatusStmt = db.prepare(
  `UPDATE actions
   SET status = ?,
       finished_at = CASE WHEN ? IS NOT NULL THEN ? ELSE finished_at END
   WHERE id = ?`
);

const selectActionByIdStmt = db.prepare("SELECT * FROM actions WHERE id = ?");

const selectActionsPageStmt = db.prepare(
  `SELECT * FROM actions
   WHERE user_id = ?1
     AND (?2 IS NULL OR created_at < ?2)
   ORDER BY created_at DESC
   LIMIT ?3`
);

const insertActionItemStmt = db.prepare(
  `INSERT INTO action_items (
    id,
    action_id,
    type,
    video_id,
    source_playlist_id,
    target_playlist_id,
    source_playlist_item_id,
    target_playlist_item_id,
    position,
    status,
    error_code,
    error_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const selectActionItemByIdStmt = db.prepare(
  "SELECT * FROM action_items WHERE id = ?"
);

const selectActionItemsStmt = db.prepare(
  "SELECT * FROM action_items WHERE action_id = ? ORDER BY rowid ASC"
);

const countActionItemsStmt = db.prepare(
  `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM action_items
    WHERE action_id = ?`
);

const updateActionItemStmt = db.prepare(
  `UPDATE action_items
   SET status = ?,
       error_code = ?,
       error_message = ?,
       target_playlist_item_id = ?
   WHERE id = ?`
);

// === Items 分頁用（不影響既有 listActionItems） ===
const selectActionItemRowidByIdStmt = db.prepare(
  "SELECT rowid AS r FROM action_items WHERE id = ?"
);

// 以 rowid 升冪，使用普通 ? 佔位，避免序號綁定問題
const selectActionItemsPageAscStmt = db.prepare(
  `SELECT * FROM action_items
   WHERE action_id = ?
     AND (? IS NULL OR rowid > ?)
   ORDER BY rowid ASC
   LIMIT ?`
);

// ✅ 嚴格版：一定回傳 string
function toIsoUtcStrict(ts: string): string {
  if (!ts) return ts; // 如果你的 DB schema 保證非空，這行其實不會觸發
  // SQLite CURRENT_TIMESTAMP: 'YYYY-MM-DD HH:MM:SS' (UTC)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)) {
    return ts.replace(" ", "T") + "Z";
  }
  return ts; // 已是 ISO 或其他格式則原樣
}

// ✅ 可為 null 的版本
function toIsoUtcNullable(ts: string | null): string | null {
  return ts ? toIsoUtcStrict(ts) : null;
}

function mapAction(row: ActionRow): ActionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    sourcePlaylistId: row.source_playlist_id ?? null,
    targetPlaylistId: row.target_playlist_id ?? null,
    status: row.status,
    createdAt: toIsoUtcStrict(row.created_at), // ★ 這裡
    finishedAt: toIsoUtcNullable(row.finished_at), // ★ 這裡
    parentActionId: row.parent_action_id ?? null,
  };
}

function mapActionItem(row: ActionItemRow): ActionItemRecord {
  return {
    id: row.id,
    actionId: row.action_id,
    type: row.type,
    videoId: row.video_id ?? null,
    sourcePlaylistId: row.source_playlist_id ?? null,
    targetPlaylistId: row.target_playlist_id ?? null,
    sourcePlaylistItemId: row.source_playlist_item_id ?? null,
    targetPlaylistItemId: row.target_playlist_item_id ?? null,
    position: row.position ?? null,
    status: row.status,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
  };
}

export function createAction(params: {
  id?: string;
  userId: string;
  type: ActionType;
  sourcePlaylistId?: string | null;
  targetPlaylistId?: string | null;
  status?: ActionStatus;
  parentActionId?: string | null;
}): ActionRecord {
  const id = params.id ?? nanoid();
  const status = params.status ?? "pending";
  insertActionStmt.run(
    id,
    params.userId,
    params.type,
    params.sourcePlaylistId ?? null,
    params.targetPlaylistId ?? null,
    status,
    params.parentActionId ?? null
  );
  const row = selectActionByIdStmt.get(id) as ActionRow | undefined;
  if (!row) {
    throw new Error("Failed to load action after insert");
  }
  return mapAction(row);
}

export function setActionStatus(
  id: string,
  status: ActionStatus,
  finishedAt?: string | null
) {
  updateActionStatusStmt.run(
    status,
    finishedAt ?? null,
    finishedAt ?? null,
    id
  );
  const row = selectActionByIdStmt.get(id) as ActionRow | undefined;
  if (!row) {
    throw new Error("Failed to load action after update");
  }
  return mapAction(row);
}

export function createActionItems(
  items: Array<{
    id?: string;
    actionId: string;
    type: ActionType;
    videoId?: string | null;
    sourcePlaylistId?: string | null;
    targetPlaylistId?: string | null;
    sourcePlaylistItemId?: string | null;
    targetPlaylistItemId?: string | null;
    position?: number | null;
    status?: ActionItemStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
  }>
) {
  const created: ActionItemRecord[] = [];
  for (const item of items) {
    const id = item.id ?? nanoid();
    insertActionItemStmt.run(
      id,
      item.actionId,
      item.type,
      item.videoId ?? null,
      item.sourcePlaylistId ?? null,
      item.targetPlaylistId ?? null,
      item.sourcePlaylistItemId ?? null,
      item.targetPlaylistItemId ?? null,
      item.position ?? null,
      item.status ?? "pending",
      item.errorCode ?? null,
      item.errorMessage ?? null
    );
    const row = selectActionItemByIdStmt.get(id) as ActionItemRow | undefined;
    if (row) {
      created.push(mapActionItem(row));
    }
  }
  return created;
}

export function updateActionItem(
  id: string,
  updates: {
    status?: ActionItemStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    targetPlaylistItemId?: string | null;
  }
) {
  const existing = selectActionItemByIdStmt.get(id) as
    | ActionItemRow
    | undefined;
  if (!existing) {
    return null;
  }
  const mergedStatus = updates.status ?? existing.status;
  const mergedErrorCode = updates.errorCode ?? existing.error_code ?? null;
  const mergedErrorMessage =
    updates.errorMessage ?? existing.error_message ?? null;
  const mergedTarget =
    updates.targetPlaylistItemId ?? existing.target_playlist_item_id ?? null;

  updateActionItemStmt.run(
    mergedStatus,
    mergedErrorCode,
    mergedErrorMessage,
    mergedTarget,
    id
  );
  const row = selectActionItemByIdStmt.get(id) as ActionItemRow | undefined;
  return row ? mapActionItem(row) : null;
}

export function listActionItems(actionId: string) {
  const rows = selectActionItemsStmt.all(actionId) as ActionItemRow[];
  return rows.map(mapActionItem);
}

export function getActionById(id: string) {
  const row = selectActionByIdStmt.get(id) as ActionRow | undefined;
  return row ? mapAction(row) : null;
}

export function listActions(
  userId: string,
  limit: number,
  cursor?: string | null
) {
  let cursorTimestamp: string | null = null;
  if (cursor) {
    const cursorAction = selectActionByIdStmt.get(cursor) as
      | ActionRow
      | undefined;
    cursorTimestamp = cursorAction?.created_at ?? null;
  }
  const rows = selectActionsPageStmt.all(
    userId,
    cursorTimestamp,
    limit
  ) as ActionRow[];
  return rows.map(mapAction);
}

export function getActionCounts(actionId: string): ActionCounts {
  const row = countActionItemsStmt.get(actionId) as
    | { total: number; success: number; failed: number }
    | undefined;
  return {
    total: row?.total ?? 0,
    success: row?.success ?? 0,
    failed: row?.failed ?? 0,
  };
}

// ✅ 全新：不用序號參數（?1 ?2 ?3），只用普通 ? 佔位
const selectActionsPageStmtNoIndex = db.prepare(
  `SELECT * FROM actions
   WHERE user_id = ?
     AND (? IS NULL OR created_at < ?)
   ORDER BY created_at DESC
   LIMIT ?`
);

/**
 * ✅ 提供 /api/actions 專用的安全版分頁
 *   - 絕不動現有的 listActions()
 *   - 內部用普通 ? 佔位，並採多引數綁定（或陣列也行）
 */
// /lib/actions-store.ts 內的 listActionsPageSafe()
export function listActionsPageSafe(
  userId: string,
  limit: number,
  cursor?: string | null
) {
  let cursorTimestamp: string | null = null;
  if (cursor) {
    const cursorAction = selectActionByIdStmt.get(cursor) as
      | ActionRow
      | undefined;
    cursorTimestamp = cursorAction?.created_at ?? null;
  }

  // ⬇️ 這行改成 4 個參數：cursorTimestamp 要傳兩次
  const rows = selectActionsPageStmtNoIndex.all(
    userId,
    cursorTimestamp,
    cursorTimestamp,
    limit
  ) as ActionRow[];

  return rows.map(mapAction);
}

// =========================
// Items 分頁（rowid 方式，安全版）
// =========================

// 取某 item 的 rowid（拿來當 cursor）
const selectItemRowidByIdStmt = db.prepare(
  `SELECT rowid as rid FROM action_items WHERE id = ?`
);

// 用普通 ? 佔位，避免 ?1/?2 混淆
const selectActionItemsPageStmtNoIndex = db.prepare(
  `SELECT * FROM action_items
   WHERE action_id = ?
     AND (? IS NULL OR rowid > ?)
   ORDER BY rowid ASC
   LIMIT ?`
);

/**
 * listActionItemsPageSafe
 * - 依 rowid 升冪分頁
 * - cursor 為「上一頁最後一筆 item 的 id」（不是 rowid），內部會轉成 rowid
 * - 回傳 { items, nextCursor }
 */
export function listActionItemsPageSafe(
  actionId: string,
  limit: number,
  cursor?: string | null
): { items: ActionItemRecord[]; nextCursor: string | null } {
  let cursorRid: number | null = null;
  if (cursor) {
    const r = selectItemRowidByIdStmt.get(cursor) as
      | { rid: number }
      | undefined;
    cursorRid = r?.rid ?? null;
  }

  const rows = selectActionItemsPageStmtNoIndex.all(
    actionId,
    cursorRid,
    cursorRid,
    limit + 1 // 多抓一筆看有沒有下一頁
  ) as ActionItemRow[];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = pageRows.map(mapActionItem);
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;

  return { items, nextCursor };
}
