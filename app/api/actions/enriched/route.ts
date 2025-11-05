// /app/api/actions/enriched/route.ts
import type { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import {
  listActionsPageSafe,
  getActionCounts,
  listActionItemsPageSafe,
} from "@/lib/actions-store";
import { getYouTubeClientEx } from "@/lib/google";
import type { youtube_v3 } from "googleapis";

// --- helpers ---
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_ITEMS_LIMIT = 20; // 每個 action 預抓幾筆 item（可自行調整）
const YT_BATCH = 50;

function chunk<T>(arr: T[], n = YT_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function fetchPlaylistNames(
  yt: youtube_v3.Youtube | null,
  ids: string[]
): Promise<Record<string, string>> {
  if (!ids.length || !yt) return {};
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  const titles: Record<string, string> = {};
  for (const part of chunk(uniq, YT_BATCH)) {
    const res = await yt.playlists.list({
      id: part,
      part: ["snippet"],
      maxResults: part.length,
    });
    for (const p of res.data.items ?? []) {
      if (p.id) titles[p.id] = p.snippet?.title ?? p.id;
    }
  }
  return titles;
}

async function fetchVideoTitles(
  yt: youtube_v3.Youtube | null,
  ids: string[]
): Promise<Record<string, string>> {
  if (!ids.length || !yt) return {};
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  const titles: Record<string, string> = {};
  for (const part of chunk(uniq, YT_BATCH)) {
    const res = await yt.videos.list({
      id: part,
      part: ["snippet"],
      maxResults: part.length,
    });
    for (const v of res.data.items ?? []) {
      if (v.id) titles[v.id] = v.snippet?.title ?? v.id;
    }
  }
  return titles;
}

// --- route ---
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUserId(request);
    if (!auth) {
      return jsonError("unauthorized", "Sign in to continue", { status: 401 });
    }

    const url = new URL(request.url);
    const limitNum = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Math.max(
      1,
      Math.min(MAX_LIMIT, Number.isFinite(limitNum) ? limitNum : DEFAULT_LIMIT)
    );
    const cursor = url.searchParams.get("cursor") || undefined;

    // 可選：每個 action 要預載入的 items 筆數
    const itemsLimitNum = Number(
      url.searchParams.get("itemsLimit") ?? DEFAULT_ITEMS_LIMIT
    );
    const itemsLimit = Math.max(
      1,
      Math.min(
        200,
        Number.isFinite(itemsLimitNum) ? itemsLimitNum : DEFAULT_ITEMS_LIMIT
      )
    );

    // 1) 讀取 actions（多抓一筆判斷 hasMore）
    const actions = await listActionsPageSafe(auth.userId, limit + 1, cursor);
    const hasMore = actions.length > limit;
    const page = hasMore ? actions.slice(0, limit) : actions;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    // 2) 讀 counts + 首頁 items
    const itemsByAction: Record<string, any[]> = {};
    const countsByAction: Record<
      string,
      { total: number; success: number; failed: number }
    > = {};

    for (const a of page) {
      const [itemsPage, counts] = await Promise.all([
        listActionItemsPageSafe(a.id, itemsLimit), // 首頁 items（依 rowid 升冪）
        getActionCounts(a.id),
      ]);
      itemsByAction[a.id] = itemsPage.items;
      countsByAction[a.id] = counts;
    }

    // 3) 收集所有 playlistIds & videoIds 以便一次打 YouTube API
    const playlistIds: string[] = [];
    const videoIds: string[] = [];

    for (const a of page) {
      if (a.sourcePlaylistId) playlistIds.push(a.sourcePlaylistId);
      if (a.targetPlaylistId) playlistIds.push(a.targetPlaylistId);
      for (const it of itemsByAction[a.id] ?? []) {
        if (it.sourcePlaylistId) playlistIds.push(it.sourcePlaylistId);
        if (it.targetPlaylistId) playlistIds.push(it.targetPlaylistId);
        if (it.videoId) videoIds.push(it.videoId);
      }
    }

    // 4) 取 YT client（無 token 則 mock，回傳空 map）
    const { yt } = await getYouTubeClientEx({
      userId: auth.userId,
      requireReal: false,
    });
    const [playlistNames, videoTitles] = await Promise.all([
      fetchPlaylistNames(yt, playlistIds),
      fetchVideoTitles(yt, videoIds),
    ]);

    // 5) 組回應
    return jsonOk({
      actions: page.map((a) => ({
        action: a,
        counts: countsByAction[a.id] ?? { total: 0, success: 0, failed: 0 },
      })),
      nextCursor,
      itemsByAction, // Record<actionId, ActionItemRecord[]>
      playlistNames, // Record<playlistId, title>
      videoTitles, // Record<videoId, title>
    });
  } catch (err: any) {
    console.error("[/api/actions/enriched] error:", err);
    const message = err?.message ?? "Internal error";
    return jsonError("internal_error", message, { status: 500 });
  }
}
