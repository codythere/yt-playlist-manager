// /app/api/actions/[id]/items/route.ts
import type { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import { getActionById, listActionItemsPageSafe } from "@/lib/actions-store";
import { getYouTubeClientEx } from "@/lib/google";
import type { youtube_v3 } from "googleapis";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type EnrichedMeta = {
  videoTitle: string | null;
  sourcePlaylistName: string | null;
  targetPlaylistName: string | null;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // ✅ 驗證登入
    const auth = await requireUserId(request);
    if (!auth) {
      return jsonError("unauthorized", "Sign in to continue", { status: 401 });
    }
    const { userId } = auth;

    // ✅ 解析 params（注意：此專案的 params 是 Promise）
    const { id: actionId } = await context.params;

    // ✅ 檢查 action 所屬
    const action = getActionById(actionId);
    if (!action || action.userId !== userId) {
      return jsonError("not_found", "Action not found", { status: 404 });
    }

    // ✅ 解析查詢參數
    const url = new URL(request.url);
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get("limit") || "20"))
    );
    const cursor = url.searchParams.get("cursor") || null;

    // ✅ 讀取此 action 的分頁 items（原始只含 ID）
    const page = listActionItemsPageSafe(actionId, limit, cursor);

    // === 收集要富集的 ID ===
    const videoIds = new Set<string>();
    const playlistIds = new Set<string>();
    for (const it of page.items) {
      if (it.videoId) videoIds.add(it.videoId);
      if (it.sourcePlaylistId) playlistIds.add(it.sourcePlaylistId);
      if (it.targetPlaylistId) playlistIds.add(it.targetPlaylistId);
    }

    // === 取得 YouTube Client（允許 mock） ===
    const { yt, mock } = await getYouTubeClientEx({
      userId,
      requireReal: false,
    });

    const videoTitleMap: Record<string, string> = {};
    const playlistNameMap: Record<string, string> = {};

    if (yt) {
      // 批次查 videos（最多 50/批）
      const videoIdList = Array.from(videoIds);
      for (let i = 0; i < videoIdList.length; i += 50) {
        const batch = videoIdList.slice(i, i + 50);
        if (batch.length === 0) continue;
        const resp = await yt.videos.list({ part: ["snippet"], id: batch });
        for (const item of resp.data.items ?? []) {
          if (item.id) {
            const title = item.snippet?.title ?? item.id;
            videoTitleMap[item.id] = title;
          }
        }
      }

      // 批次查 playlists（最多 50/批）
      const plIdList = Array.from(playlistIds);
      for (let i = 0; i < plIdList.length; i += 50) {
        const batch = plIdList.slice(i, i + 50);
        if (batch.length === 0) continue;
        const resp = await yt.playlists.list({ part: ["snippet"], id: batch });
        for (const item of resp.data.items ?? []) {
          if (item.id) {
            const title = item.snippet?.title ?? item.id;
            playlistNameMap[item.id] = title;
          }
        }
      }
    } else {
      // mock 狀態：給穩定 placeholder，避免前端再跑二段補齊導致閃爍
      for (const id of videoIds) videoTitleMap[id] = `Video ${id.slice(0, 6)}…`;
      for (const id of playlistIds)
        playlistNameMap[id] = `Playlist ${id.slice(0, 6)}…`;
    }

    // === 富集並回傳（加上 meta） ===
    const enrichedItems = page.items.map((it) => {
      const meta: EnrichedMeta = {
        videoTitle: it.videoId ? videoTitleMap[it.videoId] ?? null : null,
        sourcePlaylistName: it.sourcePlaylistId
          ? playlistNameMap[it.sourcePlaylistId] ?? null
          : null,
        targetPlaylistName: it.targetPlaylistId
          ? playlistNameMap[it.targetPlaylistId] ?? null
          : null,
      };
      return { ...it, meta };
    });

    const res = jsonOk({
      items: enrichedItems,
      nextCursor: page.nextCursor ?? null,
    });
    // 短暫私有快取：減少連點造成的抖動；仍允許 SWR
    res.headers.set(
      "Cache-Control",
      "private, max-age=15, stale-while-revalidate=60"
    );
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[/api/actions/:id/items] error:", err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
