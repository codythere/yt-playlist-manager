"use client";

import * as React from "react";
import Image from "next/image";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PlaylistSummary, PlaylistItemSummary } from "@/types/youtube";
import type { OperationResult } from "@/lib/actions-service";
import { cn } from "@/lib/utils";

import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { ActionsToolbar } from "@/app/components/ActionsToolbar";
import { PlaylistList } from "@/app/components/PlaylistList";
// import { TopBar } from "@/app/components/TopBar";

/* =========================
 * 型別與共用工具
 * ========================= */

type View = "select-playlists" | "manage-items";

interface AuthState {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  usingMock: boolean;
}

interface PlaylistsPayload {
  playlists: PlaylistSummary[];
  estimatedQuota: number;
  usingMock: boolean;
}

interface ThumbnailMapEntry {
  url?: string;
  width?: number;
  height?: number;
}
interface ThumbnailMap {
  default?: ThumbnailMapEntry;
  medium?: ThumbnailMapEntry;
  high?: ThumbnailMapEntry;
  standard?: ThumbnailMapEntry;
  maxres?: ThumbnailMapEntry;
}

interface PlaylistItemApiEntry {
  id: string;
  videoId: string;
  title: string;
  position: number | null;
  channelTitle: string;
  thumbnails: ThumbnailMap | null;
  publishedAt: string | null;
}

interface PlaylistItemsPayload {
  items: PlaylistItemApiEntry[];
  nextPageToken?: string | null;
  usingMock: boolean;
}

function extractThumbnailUrl(th: ThumbnailMap | null) {
  return th?.medium?.url ?? th?.high?.url ?? th?.default?.url ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function extractApiError(
  payload: unknown
): { code?: string; message?: string } | null {
  if (!isRecord(payload)) return null;
  if (payload.ok === false && isRecord(payload.error)) {
    const e = payload.error as Record<string, unknown>;
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
    };
  }
  return null;
}
function extractApiData<T>(payload: unknown): T | undefined {
  if (!isRecord(payload)) return undefined;
  if (payload.ok === true && "data" in payload) {
    return payload.data as T;
  }
  return undefined;
}

/* ---- 封裝 fetch ---- */
async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  let payload: unknown = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText || "Request failed");
  }

  const apiErr = extractApiError(payload);
  if (!res.ok || apiErr) {
    const err = new Error(
      apiErr?.message ?? res.statusText ?? "Request failed"
    ) as Error & { code?: string; status?: number };
    err.code = apiErr?.code;
    err.status = res.status;
    throw err;
  }

  const data = extractApiData<T>(payload);
  return (data !== undefined ? data : (payload as T)) as T;
}

async function fetchAuth(): Promise<AuthState> {
  return apiRequest<AuthState>("/api/auth/me");
}

function usePlaylists(enabled: boolean) {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: () => apiRequest<PlaylistsPayload>("/api/playlists"),
    enabled,
    staleTime: 15_000,
  });
}

/* =========================
 * UI 子元件
 * ========================= */

/** ✅ 單一影片列：只有 checked 或 item.id 改變時才重渲染 */
const ItemRow = React.memo(
  function ItemRow(props: {
    item: PlaylistItemSummary;
    checked: boolean;
    onToggle: (item: PlaylistItemSummary, checked: boolean) => void;
  }) {
    const { item, checked, onToggle } = props;
    return (
      <label
        className={cn(
          "flex cursor-pointer gap-3 rounded-md border bg-background p-2 transition",
          checked && "border-primary ring-2 ring-primary/30"
        )}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={(c) => onToggle(item, Boolean(c))}
          className="mt-1"
        />
        <div className="relative h-14 w-24 overflow-hidden rounded bg-muted flex-shrink-0">
          {item.thumbnailUrl ? (
            <Image
              src={item.thumbnailUrl}
              alt={item.title}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium">{item.title}</div>
          <div className="text-xs text-muted-foreground">
            {item.channelTitle}
          </div>
        </div>
      </label>
    );
  },
  (prev, next) => {
    return (
      prev.checked === next.checked &&
      prev.item.playlistItemId === next.item.playlistItemId
    );
  }
);

/** 欄（PlaylistColumn）：改用虛擬滾動，只渲染可視範圍的影片列 */
/** 欄（PlaylistColumn）：虛擬滾動（用實測高度） */
function PlaylistColumn(props: {
  playlist: PlaylistSummary;
  items: PlaylistItemSummary[];
  selectedItemIds: Set<string>;
  onToggleItem: (item: PlaylistItemSummary, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const { playlist, items, selectedItemIds, onToggleItem, onToggleAll } = props;

  const scrollParentRef = React.useRef<HTMLDivElement>(null);

  // 估一個接近的列高（內容高度 + 間距），初始用；真正以 measureElement 為準
  const ROW_HEIGHT = 72;
  const ROW_GAP = 8;

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT + ROW_GAP, // 初估值含 gap
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height, // 用實測值（會含 padding）
  });

  const allSelected =
    items.length > 0 &&
    items.every((x) => selectedItemIds.has(x.playlistItemId));

  return (
    <div className="min-w-[340px] w-[340px] shrink-0 rounded-lg border bg-card shadow-sm">
      {/* 欄頭 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm font-semibold">{playlist.title}</div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => onToggleAll(Boolean(c))}
          />
          全選
        </label>
      </div>

      {/* 影片清單（虛擬化容器） */}
      <div
        ref={scrollParentRef}
        className="overflow-auto px-3 py-3"
        style={{ height: 520 }} // 固定高度才會在欄內滾動
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(), // 交給 react-virtual 計算
            position: "relative",
            width: "100%",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const item = items[vi.index];
            const checked = selectedItemIds.has(item.playlistItemId);
            const isLast = vi.index === items.length - 1;

            return (
              <div
                key={item.playlistItemId}
                ref={rowVirtualizer.measureElement} // 讓虛擬器實測高度
                data-index={vi.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`, // 不再手加 index*gap
                  paddingBottom: isLast ? 0 : ROW_GAP, // 用 padding 製造列間距（可視覺等同 gap）
                }}
              >
                <ItemRow
                  item={item}
                  checked={checked}
                  onToggle={onToggleItem}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 欄級別也 memo；只要 selected Set 引用/ items 引用不變，就不重繪整欄 */
const MemoPlaylistColumn = React.memo(PlaylistColumn, (prev, next) => {
  const samePlaylist = prev.playlist.id === next.playlist.id;
  const sameSelectedSetRef = prev.selectedItemIds === next.selectedItemIds;
  const sameItemsRef = prev.items === next.items;
  return samePlaylist && sameSelectedSetRef && sameItemsRef;
});

/* =========================
 * 主元件：HomeClient
 * ========================= */
export default function HomeClient() {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = React.useTransition();

  /* ---- Auth ---- */
  const authQ = useQuery({
    queryKey: ["auth"],
    queryFn: fetchAuth,
    staleTime: 30_000,
  });
  const auth = authQ.data;

  /* ---- 取得播放清單 ---- */
  const playlistsQ = usePlaylists(
    Boolean(auth && (auth.authenticated || auth.usingMock))
  );
  const allPlaylists = React.useMemo(
    () => playlistsQ.data?.playlists ?? [],
    [playlistsQ.data?.playlists]
  );

  /* ---- 視圖狀態 ---- */
  const [view, setView] = React.useState<View>("select-playlists");

  /* ---- 稿件 1：多選播放清單 ---- */
  const [checkedPlaylistIds, setCheckedPlaylistIds] = React.useState<
    Set<string>
  >(new Set());

  React.useEffect(() => {
    if (allPlaylists.length > 0 && checkedPlaylistIds.size === 0) {
      setCheckedPlaylistIds(new Set(allPlaylists.slice(0, 2).map((p) => p.id)));
    }
  }, [allPlaylists]); // eslint-disable-line

  const toggleSelectPlaylist = (pid: string, checked: boolean) => {
    setCheckedPlaylistIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(pid);
      else next.delete(pid);
      return next;
    });
  };
  const onCancelSelect = () => setCheckedPlaylistIds(new Set());
  const onConfirmSelect = () => {
    if (checkedPlaylistIds.size === 0) return;
    setView("manage-items");
  };

  /* ---- 稿件 2：跨欄位選取影片 ---- */
  const [selectedMap, setSelectedMap] = React.useState<
    Record<string, Set<string>>
  >({});

  const confirmedPlaylists = React.useMemo(
    () => allPlaylists.filter((p) => checkedPlaylistIds.has(p.id)),
    [allPlaylists, checkedPlaylistIds]
  );

  /* ---- 依「被選清單」載入每欄影片 ---- */
  const columnsData = useQueries({
    queries: confirmedPlaylists.map((p) => ({
      queryKey: ["playlist-items", p.id],
      queryFn: async () => {
        const data = await apiRequest<PlaylistItemsPayload>(
          `/api/playlist-items?playlistId=${encodeURIComponent(p.id)}`
        );
        const items: PlaylistItemSummary[] = (data.items ?? []).map((it) => ({
          playlistItemId: it.id,
          videoId: it.videoId,
          title: it.title,
          channelTitle: it.channelTitle,
          thumbnailUrl: extractThumbnailUrl(it.thumbnails),
          position: it.position ?? null,
        }));
        return { playlist: p, items };
      },
      enabled: view === "manage-items",
      staleTime: 10_000,
    })),
  });

  /* ---- 動作列數據 ---- */
  const totalSelectedCount = React.useMemo(
    () =>
      Object.values(selectedMap).reduce((sum, s) => sum + (s?.size ?? 0), 0),
    [selectedMap]
  );
  const estimatedQuota = totalSelectedCount * 50;

  /* ---- Mutations ---- */
  const addMutation = useMutation({
    mutationFn: (payload: { targetPlaylistId: string; videoIds: string[] }) =>
      apiRequest<OperationResult>("/api/bulk/add", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      confirmedPlaylists.forEach((p) =>
        queryClient.invalidateQueries({ queryKey: ["playlist-items", p.id] })
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (payload: {
      playlistItemIds: string[];
      sourcePlaylistId: string;
    }) =>
      apiRequest<OperationResult>("/api/bulk/remove", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, variables) => {
      setSelectedMap((prev) => ({
        ...prev,
        [variables.sourcePlaylistId]: new Set(),
      }));
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.sourcePlaylistId],
      });
    },
  });

  const moveMutation = useMutation({
    mutationFn: (payload: {
      sourcePlaylistId: string;
      targetPlaylistId: string;
      items: Array<{ playlistItemId: string; videoId: string }>;
    }) =>
      apiRequest<OperationResult>("/api/bulk/move", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, variables) => {
      setSelectedMap((prev) => ({
        ...prev,
        [variables.sourcePlaylistId]: new Set(),
      }));
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.sourcePlaylistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.targetPlaylistId],
      });
    },
  });

  /* ---- 抽取被勾選 ---- */
  function getSelectedFromAllColumns() {
    const result: {
      bySource: Record<
        string,
        { playlistItemIds: string[]; videoIds: string[] }
      >;
      allVideoIds: string[];
    } = { bySource: {}, allVideoIds: [] };

    confirmedPlaylists.forEach((p) => {
      const q = columnsData.find((cq) => cq.data?.playlist.id === p.id);
      const set = selectedMap[p.id] ?? new Set<string>();
      const items = q?.data?.items ?? [];
      const picked = items.filter((it) => set.has(it.playlistItemId));
      const playlistItemIds = picked.map((it) => it.playlistItemId);
      const videoIds = picked.map((it) => it.videoId);

      if (playlistItemIds.length) {
        result.bySource[p.id] = { playlistItemIds, videoIds };
        result.allVideoIds.push(...videoIds);
      }
    });

    return result;
  }

  /* ---- 動作列 Callback（零參數） ---- */
  const handleAddSelected = () => {
    const { allVideoIds } = getSelectedFromAllColumns();
    if (allVideoIds.length === 0) return;

    const hint =
      "輸入目標播放清單 ID（或精準標題）。\n可用的清單：\n" +
      allPlaylists.map((p) => `• ${p.title} (${p.id})`).join("\n");
    const input = window.prompt(hint) || "";
    const to =
      allPlaylists.find((p) => p.id === input || p.title === input)?.id ?? "";
    if (!to) return;

    addMutation.mutate({ targetPlaylistId: to, videoIds: allVideoIds });
  };

  const handleRemoveSelected = () => {
    Object.entries(selectedMap).forEach(([sourcePlaylistId, set]) => {
      const ids = Array.from(set);
      if (ids.length > 0) {
        removeMutation.mutate({ playlistItemIds: ids, sourcePlaylistId });
      }
    });
  };

  const handleMoveSelected = () => {
    const hint =
      "輸入目標播放清單 ID（或精準標題）。\n可用的清單：\n" +
      allPlaylists.map((p) => `• ${p.title} (${p.id})`).join("\n");
    const input = window.prompt(hint) || "";
    const to =
      allPlaylists.find((p) => p.id === input || p.title === input)?.id ?? "";
    if (!to) return;

    Object.entries(selectedMap).forEach(([sourcePlaylistId, set]) => {
      const itemsInSource =
        columnsData
          .find((q) => q.data?.playlist.id === sourcePlaylistId)
          ?.data?.items.filter((it) => set.has(it.playlistItemId)) ?? [];
      if (itemsInSource.length > 0) {
        moveMutation.mutate({
          sourcePlaylistId,
          targetPlaylistId: to,
          items: itemsInSource.map((it) => ({
            playlistItemId: it.playlistItemId,
            videoId: it.videoId,
          })),
        });
      }
    });
  };

  const onUndo = () => {};
  const backToSelect = () => setView("select-playlists");
  const clearAllSelections = () => setSelectedMap({});

  /* ---- 登入/登出 ---- */
  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };
  const logoutMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setCheckedPlaylistIds(new Set());
      setSelectedMap({});
      setView("select-playlists");
    },
  });

  /* =========================
   * 兩條同步滑軌（Top/Bottom）
   * ========================= */
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const bottomScrollRef = React.useRef<HTMLDivElement>(null);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = React.useState(0);
  const syncingRef = React.useRef<"top" | "bottom" | null>(null);

  const onTopScroll = () => {
    if (!topScrollRef.current || !bottomScrollRef.current) return;
    if (syncingRef.current === "bottom") return;
    syncingRef.current = "top";
    bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    syncingRef.current = null;
  };
  const onBottomScroll = () => {
    if (!topScrollRef.current || !bottomScrollRef.current) return;
    if (syncingRef.current === "top") return;
    syncingRef.current = "bottom";
    topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    syncingRef.current = null;
  };

  // 追蹤每欄的 items 長度，內容變化時重算寬度
  const columnsKey = React.useMemo(
    () =>
      columnsData
        .map(
          (q, i) =>
            `${confirmedPlaylists[i]?.id ?? "x"}:${q.data?.items?.length ?? 0}`
        )
        .join("|"),
    [columnsData, confirmedPlaylists]
  );

  // 更穩定的寬度計算：用 rowRef.scrollWidth
  React.useLayoutEffect(() => {
    const update = () => {
      const w =
        rowRef.current?.scrollWidth ??
        bottomScrollRef.current?.scrollWidth ??
        0;
      setContentWidth(w);
    };

    update(); // 初次

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && rowRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(rowRef.current);
    }
    window.addEventListener("resize", update);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [confirmedPlaylists.length, columnsKey]);

  /* =========================
   * Render
   * ========================= */

  // mounted gate：避免 hydration 前 effect 影響首屏
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  // 1) Auth 狀態
  if (authQ.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (authQ.isError || !auth) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load authentication status. Please refresh.
      </div>
    );
  }
  if (!auth.authenticated && !auth.usingMock) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">
          Sign in to manage your playlists
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect your Google account to fetch playlists and run bulk operations
          with the YouTube Data API.
        </p>
        <div className="flex gap-2">
          <Button onClick={handleLogin}>Sign in with Google</Button>
        </div>
      </div>
    );
  }

  // 2) 主介面
  return (
    <div className="min-h-dvh">
      {/* <TopBar /> */}

      {view === "select-playlists" ? (
        /* ---------- UI 稿件 1：多選播放清單 ---------- */
        <main className="mx-auto max-w-6xl p-6 space-y-8">
          <section className="space-y-3">
            <div className="text-lg font-semibold">已選取播放清單：</div>
            <div className="flex flex-wrap gap-2">
              {[...checkedPlaylistIds].map((pid) => {
                const p = allPlaylists.find((x) => x.id === pid);
                if (!p) return null;
                return (
                  <span
                    key={pid}
                    className="inline-flex items-center rounded-full border px-3 py-1 text-sm"
                  >
                    {p.title}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onCancelSelect}>
                取消
              </Button>
              <Button
                onClick={onConfirmSelect}
                disabled={checkedPlaylistIds.size === 0}
              >
                確認
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xl font-semibold">播放清單</div>
            <PlaylistList
              playlists={allPlaylists}
              selectable
              selectedIds={checkedPlaylistIds}
              onToggleSelect={toggleSelectPlaylist}
              isLoading={playlistsQ.isLoading}
            />
          </section>
        </main>
      ) : (
        /* ---------- UI 稿件 2：管理多欄影片 ---------- */
        <main className="mx-auto max-w-[1200px] p-6 space-y-8">
          <section className="flex justify-end">
            <Button variant="ghost" onClick={backToSelect}>
              ← 返回選取播放清單
            </Button>
          </section>

          <section className="space-y-3">
            <div className="text-lg font-semibold">已選取播放清單：</div>
            <div className="flex flex-wrap gap-2">
              {confirmedPlaylists.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center rounded-full border px-3 py-1 text-sm"
                >
                  {p.title}
                </span>
              ))}
            </div>
          </section>

          <section>
            <ActionsToolbar
              selectedCount={totalSelectedCount}
              playlists={allPlaylists}
              selectedPlaylistId={null}
              onAdd={handleAddSelected}
              onRemove={handleRemoveSelected}
              onMove={handleMoveSelected}
              onUndo={onUndo}
              isLoading={
                addMutation.isPending ||
                removeMutation.isPending ||
                moveMutation.isPending
              }
              estimatedQuota={estimatedQuota}
            />
          </section>

          {/* 下方內容 + 雙滑軌 */}
          <section className="space-y-3">
            <div className="flex justify-between">
              <div className="text-xl font-semibold">播放清單</div>
              <Button variant="ghost" onClick={clearAllSelections}>
                取消勾選
              </Button>
            </div>

            {/* Top scrollbar（同步） */}
            {/* <div
              ref={topScrollRef}
              onScroll={onTopScroll}
              className="overflow-x-auto overflow-y-hidden h-4 mb-2"
            >
              <div style={{ width: contentWidth }} className="h-px" />
            </div> */}

            {/* Bottom scrollbar + 真實內容（同步） */}
            <div className="relative">
              <div
                ref={bottomScrollRef}
                onScroll={onBottomScroll}
                className="overflow-x-auto pb-2"
              >
                <div ref={rowRef} className="flex w-max gap-4">
                  {columnsData.map((q, idx) => {
                    const pid = confirmedPlaylists[idx]?.id;
                    const playlist = confirmedPlaylists[idx];
                    if (!playlist) return null;

                    if (q.isLoading) {
                      return (
                        <div
                          key={playlist.id}
                          className="min-w-[340px] w-[340px] shrink-0 rounded-lg border bg-card shadow-sm p-4 text-sm text-muted-foreground"
                        >
                          載入中…
                        </div>
                      );
                    }
                    if (q.isError) {
                      return (
                        <div
                          key={playlist.id}
                          className="min-w-[340px] w-[340px] shrink-0 rounded-lg border bg-card shadow-sm p-4 text-sm text-destructive"
                        >
                          讀取失敗
                        </div>
                      );
                    }

                    const items = q.data?.items ?? [];
                    const selectedSet = selectedMap[pid!] ?? new Set<string>();

                    return (
                      <MemoPlaylistColumn
                        key={playlist.id}
                        playlist={playlist}
                        items={items}
                        selectedItemIds={selectedSet}
                        onToggleItem={(item, checked) => {
                          // 只更新該欄的 Set；搭配 ItemRow.memo + 虛擬化，只重繪視窗中的少數列
                          startTransition(() => {
                            setSelectedMap((prev) => {
                              const next = { ...prev };
                              const cur = new Set(next[playlist.id] ?? []);
                              if (checked) cur.add(item.playlistItemId);
                              else cur.delete(item.playlistItemId);
                              next[playlist.id] = cur;
                              return next;
                            });
                          });
                        }}
                        onToggleAll={(checked) => {
                          startTransition(() => {
                            setSelectedMap((prev) => {
                              const next = { ...prev };
                              next[playlist.id] = checked
                                ? new Set(items.map((i) => i.playlistItemId))
                                : new Set<string>();
                              return next;
                            });
                          });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
