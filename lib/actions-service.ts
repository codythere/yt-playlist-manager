// lib/actions-service.ts（只貼 performBulkMove，其他維持原狀）
import { nanoid } from "nanoid";
import { logger } from "./logger";
import { getYouTubeClient } from "./google";
import { parseYouTubeError } from "./errors";
import {
  createAction,
  createActionItems,
  getActionById,
  getActionCounts,
  listActionItems,
  setActionStatus,
  updateActionItem,
} from "./actions-store";
import type { ActionType } from "@/types/actions";
import type {
  ActionCounts,
  ActionItemRecord,
  ActionRecord,
} from "@/types/actions";

// validators 型別
import type {
  BulkMovePayload,
  BulkAddPayload,
  // 如果你的 validators/bulk 沒有匯出 BulkRemovePayload，就暫時用下面的 fallback 型別
  BulkRemovePayload,
} from "@/validators/bulk";

export interface OperationResult {
  action: ActionRecord;
  items: ActionItemRecord[];
  counts: ActionCounts;
  estimatedQuota: number;
  usingMock: boolean; // 寫入操作固定為 false（嚴格模式）
}

const INSERT_DELETE_QUOTA_COST = 50;

/** 序列化時的重試（含指數退避 + 抖動） */
async function retryTransient<T>(
  fn: () => Promise<T>,
  {
    retries = 5,
    baseMs = 300,
    maxMs = 3000,
  }: { retries?: number; baseMs?: number; maxMs?: number } = {}
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const parsed = parseYouTubeError(e);
      const code = (parsed.code || "").toUpperCase();
      const msg = (parsed.message || "").toLowerCase();

      // 把 409 ABORTED / SERVICE_UNAVAILABLE / aborted 視為暫時性
      const isTransient =
        code === "SERVICE_UNAVAILABLE" ||
        code === "ABORTED" ||
        msg.includes("aborted") ||
        msg.includes("temporary") ||
        msg.includes("unavailable") ||
        msg.includes("backend error");

      if (!isTransient || i === retries) break;

      // 退避 + 抖動
      const delay =
        Math.min(baseMs * Math.pow(2, i), maxMs) * (1 + Math.random() * 0.3);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function finalize(actionId: string) {
  const counts = getActionCounts(actionId);
  const status =
    counts.total === 0
      ? "success"
      : counts.failed === counts.total
      ? "failed"
      : counts.failed > 0
      ? "partial"
      : "success";
  const finalAction = setActionStatus(
    actionId,
    status,
    new Date().toISOString()
  );
  const items = listActionItems(actionId);
  return { finalAction, counts, items };
}

export async function performBulkMove(
  payload: BulkMovePayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
) {
  const action = createAction({
    id: options.actionId,
    userId: options.userId,
    type: "MOVE",
    sourcePlaylistId: payload.sourcePlaylistId,
    targetPlaylistId: payload.targetPlaylistId,
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  const items = createActionItems(
    payload.items.map((it) => ({
      actionId: action.id,
      type: "MOVE" as ActionType,
      sourcePlaylistId: payload.sourcePlaylistId,
      targetPlaylistId: payload.targetPlaylistId,
      sourcePlaylistItemId: it.playlistItemId,
      videoId: it.videoId,
    }))
  );

  const client = await (async () => {
    try {
      return await getYouTubeClient(options.userId);
    } catch (e) {
      logger.error({ err: e }, "Failed to create YouTube client");
      return null;
    }
  })();

  const usingMock = !client;
  const estimatedQuota = payload.items.length * INSERT_DELETE_QUOTA_COST * 2;

  if (!client) {
    for (const item of items) {
      updateActionItem(item.id, {
        status: "success",
        targetPlaylistItemId: `mock-${item.videoId}`,
      });
    }
    const { finalAction, counts, items: finalItems } = finalize(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  // === 1) 逐筆「插入目標」→ 成功的才記錄新 ID（嚴格序列化，避免後端鎖衝突） ===
  const insertedSucceeded: typeof items = [];
  for (const item of items) {
    try {
      const resp = await retryTransient(() =>
        client.playlistItems.insert({
          part: ["snippet"],
          requestBody: {
            snippet: {
              playlistId: payload.targetPlaylistId,
              resourceId: {
                kind: "youtube#video",
                videoId: item.videoId ?? undefined,
              },
            },
          },
        })
      );
      const newId = resp.data.id ?? `mock-${nanoid(8)}`;
      updateActionItem(item.id, { targetPlaylistItemId: newId });
      insertedSucceeded.push(item);

      // 小間隔，降低後端壓力（再配合重試）
      await new Promise((r) => setTimeout(r, 120));
    } catch (e) {
      const parsed = parseYouTubeError(e);
      updateActionItem(item.id, {
        status: "failed",
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
      logger.error(
        { err: e, itemId: item.id },
        "Failed to insert playlist item while moving"
      );
    }
  }

  // === 2) 逐筆刪「來源項目」，只處理已插入成功者（序列化 + 重試）===
  for (const item of insertedSucceeded) {
    if (!item.sourcePlaylistItemId) {
      updateActionItem(item.id, {
        status: "failed",
        errorCode: "MISSING_SOURCE_ID",
        errorMessage: "Missing source playlist item id",
      });
      continue;
    }
    try {
      await retryTransient(() =>
        client.playlistItems.delete({ id: item.sourcePlaylistItemId! })
      );
      updateActionItem(item.id, { status: "success" });
      await new Promise((r) => setTimeout(r, 80));
    } catch (e) {
      const parsed = parseYouTubeError(e);
      // 已插入成功但刪除失敗 → 保留 targetPlaylistItemId，標 failed 以便後續 retry
      updateActionItem(item.id, {
        status: "failed",
        errorCode: parsed.code || "DELETE_FAILED",
        errorMessage: parsed.message || "Failed to delete source playlist item",
      });
      logger.error(
        { err: e, itemId: item.id },
        "Failed to delete source playlist item during move"
      );
    }
  }

  const { finalAction, counts, items: finalItems } = finalize(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

// === 新增：批次移除（序列化 + 指數退避重試）===
// === 取代/更新：批次移除（序列化 + 指數退避重試 + 404 視為成功）===
export async function performBulkRemove(
  payload: BulkRemovePayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
): Promise<{
  action: ActionRecord;
  items: ActionItemRecord[];
  counts: ActionCounts;
  estimatedQuota: number;
  usingMock: boolean;
}> {
  const action = createAction({
    id: options.actionId,
    userId: options.userId,
    type: "REMOVE",
    // 可帶來源清單供追蹤 (前端有傳就記、沒有就 null)
    sourcePlaylistId: (payload as any).sourcePlaylistId ?? null,
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  // 1) 先做去重，避免同一 id 重複打 API
  const uniqueIds = Array.from(new Set(payload.playlistItemIds));

  // 2) 建立 action items
  const items = createActionItems(
    uniqueIds.map((playlistItemId: string) => ({
      actionId: action.id,
      type: "REMOVE" as ActionType,
      sourcePlaylistItemId: playlistItemId,
      sourcePlaylistId: (payload as any).sourcePlaylistId ?? null,
      videoId: null,
    }))
  );

  // 3) 建立 client
  const client = await (async () => {
    try {
      return await getYouTubeClient(options.userId);
    } catch (e) {
      logger.error({ err: e }, "Failed to create YouTube client");
      return null;
    }
  })();

  const usingMock = !client;
  const estimatedQuota = uniqueIds.length * INSERT_DELETE_QUOTA_COST;

  // 4) 沒 client → 視為成功（mock）
  if (!client) {
    for (const it of items) {
      updateActionItem(it.id, { status: "success" });
    }
    const { finalAction, counts, items: finalItems } = finalize(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  // 小工具：判斷「已不存在 → 視為成功」
  const isIdempotentNotFound = (code?: string, msg?: string) => {
    const c = (code || "").toLowerCase();
    const m = (msg || "").toLowerCase();
    return c === "playlistitemnotfound" || m.includes("not found");
  };

  // 5) 逐筆序列化刪除 + 重試；404 視為成功
  for (const it of items) {
    if (!it.sourcePlaylistItemId) {
      updateActionItem(it.id, {
        status: "failed",
        errorCode: "MISSING_PLAYLIST_ITEM_ID",
        errorMessage: "Missing playlist item identifier",
      });
      continue;
    }

    try {
      await retryTransient(() =>
        client.playlistItems.delete({ id: it.sourcePlaylistItemId! })
      );
      updateActionItem(it.id, { status: "success" });
      await new Promise((r) => setTimeout(r, 80));
    } catch (e) {
      const parsed = parseYouTubeError(e);

      // ✅ 這裡是關鍵：404/playlistItemNotFound → 當作早已刪除成功（idempotent success）
      if (isIdempotentNotFound(parsed.code, parsed.message)) {
        updateActionItem(it.id, {
          status: "success",
          // 若你想保留診斷，可留個備註欄位（沒有就略過）
          // errorCode: "ALREADY_REMOVED",
          // errorMessage: parsed.message || "Item already removed",
        });
        logger.info(
          { itemId: it.id, playlistItemId: it.sourcePlaylistItemId },
          "Remove treated as success (already removed)"
        );
        continue;
      }

      // 其它錯誤 → 仍標記失敗
      updateActionItem(it.id, {
        status: "failed",
        errorCode: parsed.code || "DELETE_FAILED",
        errorMessage: parsed.message || "Failed to delete playlist item",
      });
      logger.error({ err: e, itemId: it.id }, "Failed to remove playlist item");
    }
  }

  const { finalAction, counts, items: finalItems } = finalize(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

// === 新增：批次新增到某播放清單（序列化 + 指數退避重試）===
export async function performBulkAdd(
  payload: BulkAddPayload,
  options: { actionId?: string; userId: string; parentActionId?: string }
): Promise<OperationResult> {
  const action = createAction({
    id: options.actionId,
    userId: options.userId,
    type: "ADD",
    targetPlaylistId: payload.targetPlaylistId,
    status: "running",
    parentActionId: options.parentActionId ?? null,
  });

  // 建立每一筆 action item
  const items = createActionItems(
    payload.videoIds.map((videoId) => ({
      actionId: action.id,
      type: "ADD" as ActionType,
      videoId,
      targetPlaylistId: payload.targetPlaylistId,
    }))
  );

  // 建立 YouTube client
  const client = await (async () => {
    try {
      return await getYouTubeClient(options.userId);
    } catch (e) {
      logger.error({ err: e }, "Failed to create YouTube client");
      return null;
    }
  })();

  const usingMock = !client;
  const estimatedQuota = payload.videoIds.length * INSERT_DELETE_QUOTA_COST;

  // 無 client（mock）→ 視為成功並給 mock id
  if (!client) {
    for (const it of items) {
      updateActionItem(it.id, {
        status: "success",
        targetPlaylistItemId: `mock-${it.videoId}`,
      });
    }
    const { finalAction, counts, items: finalItems } = finalize(action.id);
    return {
      action: finalAction,
      items: finalItems,
      counts,
      estimatedQuota,
      usingMock,
    };
  }

  // 有 client → 逐筆序列化 insert + 重試（避免偶發 409/Service Unavailable）
  for (const it of items) {
    try {
      const resp = await retryTransient(() =>
        client.playlistItems.insert({
          part: ["snippet"],
          requestBody: {
            snippet: {
              playlistId: payload.targetPlaylistId,
              resourceId: {
                kind: "youtube#video",
                videoId: it.videoId ?? undefined,
              },
            },
          },
        })
      );
      const newId = resp.data.id ?? `mock-${nanoid(8)}`;
      updateActionItem(it.id, {
        status: "success",
        targetPlaylistItemId: newId,
      });
      // 輕微間隔降低後端壓力
      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      const parsed = parseYouTubeError(e);
      updateActionItem(it.id, {
        status: "failed",
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
      logger.error(
        { err: e, itemId: it.id },
        "Failed to add video to playlist"
      );
    }
  }

  const { finalAction, counts, items: finalItems } = finalize(action.id);
  return {
    action: finalAction,
    items: finalItems,
    counts,
    estimatedQuota,
    usingMock,
  };
}

// === 新增：回傳某 action 的摘要（action 本體 + counts + items）===
export function getActionSummary(actionId: string): {
  action: ActionRecord;
  counts: ActionCounts;
  items: ActionItemRecord[];
} | null {
  const action = getActionById(actionId);
  if (!action) return null;
  const counts = getActionCounts(actionId);
  const items = listActionItems(actionId);
  return { action, counts, items };
}
