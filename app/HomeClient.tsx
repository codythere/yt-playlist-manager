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

import { PlaylistList } from "@/app/components/PlaylistList";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { ActionsToolbar } from "@/app/components/ActionsToolbar";
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

// 把某個 playlist 的快取 items 過濾掉指定 playlistItemIds
function removeFromPlaylistCache(
  queryClient: import("@tanstack/react-query").QueryClient,
  playlistId: string,
  removeIds: string[]
) {
  const key = ["playlist-items", playlistId] as const;
  const prev = queryClient.getQueryData<{
    playlist: PlaylistSummary;
    items: PlaylistItemSummary[];
  }>(key);
  if (!prev) return;
  const removeSet = new Set(removeIds);
  const next = {
    ...prev,
    items: prev.items.filter((it) => !removeSet.has(it.playlistItemId)),
  };
  queryClient.setQueryData(key, next);
}

function usePlaylists(enabled: boolean) {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: () => apiRequest<PlaylistsPayload>("/api/playlists"),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
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

  const ROW_HEIGHT = 72;
  const ROW_GAP = 8;

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
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
        style={{ height: 520 }}
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
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
                ref={rowVirtualizer.measureElement}
                data-index={vi.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                  paddingBottom: isLast ? 0 : ROW_GAP,
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true, // ✅ 重新聚焦就重抓
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
      staleTime: 0,
      refetchOnMount: "always",
    })),
  });

  /* ---- 動作列數據 ---- */
  const totalSelectedCount = React.useMemo(
    () =>
      Object.values(selectedMap).reduce((sum, s) => sum + (s?.size ?? 0), 0),
    [selectedMap]
  );
  const estimatedQuota = totalSelectedCount * 50;

  /* ---- 目標清單（由工具列 DDL 選擇） ---- */
  const [targetPlaylistId, setTargetPlaylistId] = React.useState<string | null>(
    null
  );

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

    // ⭐ 樂觀更新
    onMutate: async (variables) => {
      const { sourcePlaylistId, playlistItemIds } = variables;

      // 1) 取消進行中的同鍵查詢，避免它覆蓋我們的樂觀結果
      await queryClient.cancelQueries({
        queryKey: ["playlist-items", sourcePlaylistId],
      });

      // 2) 拿快照
      const key = ["playlist-items", sourcePlaylistId] as const;
      const snapshot = queryClient.getQueryData<{
        playlist: PlaylistSummary;
        items: PlaylistItemSummary[];
      }>(key);

      // 3) 立即從快取移除（畫面立刻消失）
      removeFromPlaylistCache(queryClient, sourcePlaylistId, playlistItemIds);

      // 4) 同時把選取狀態清空
      setSelectedMap((prev) => ({ ...prev, [sourcePlaylistId]: new Set() }));

      // 5) 傳回快照給 onError 回滾用
      return { key, snapshot };
    },

    // 失敗 → 回滾
    onError: (_err, _variables, context) => {
      if (context?.key && context?.snapshot) {
        queryClient.setQueryData(context.key, context.snapshot);
      }
    },

    // 成功或失敗都會進來
    onSettled: async (_data, _error, variables) => {
      // 先做一次 invalidation（背景更新）
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      await queryClient.invalidateQueries({
        queryKey: ["playlist-items", variables.sourcePlaylistId],
      });

      // 再等 200ms 做一次強制 refetch（吃掉 YouTube 最終一致性）
      await new Promise((r) => setTimeout(r, 200));
      await queryClient.refetchQueries({
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

  /* ---- 動作列 Callback ---- */

  const handleAddSelected = () => {
    const { allVideoIds } = getSelectedFromAllColumns();
    if (allVideoIds.length === 0) return;

    // Add 保持原行為（若你也想走 DDL，可和 Move 同樣改法）
    const hint =
      "輸入目標播放清單 ID（或精準標題）。\n可用的清單：\n" +
      allPlaylists.map((p) => `• ${p.title} (${p.id})`).join("\n");
    const input = window.prompt(hint) || "";
    const to =
      allPlaylists.find((p) => p.id === input || p.title === input)?.id ?? "";
    if (!to) return;

    addMutation.mutate({ targetPlaylistId: to, videoIds: allVideoIds });
  };

  // ⭐ 修正重點：優先使用 DDL 的目標；若沒有就提醒，不再使用 prompt；加入二次確認
  const handleMoveSelected = (targetIdFromToolbar?: string | null) => {
    const to = (targetIdFromToolbar ?? targetPlaylistId) || null;
    if (!to) {
      window.alert("請先在工具列的下拉選單選擇【目標播放清單】。");
      return;
    }

    const total = totalSelectedCount;
    if (total === 0) return;

    const targetName =
      allPlaylists.find((p) => p.id === to)?.title ?? `(ID: ${to})`;
    const ok = window.confirm(
      `確認要將已勾選的 ${total} 部影片「一併移轉」到「${targetName}」嗎？`
    );
    if (!ok) return;

    // 逐來源清單執行 move
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

  const handleRemoveSelected = () => {
    Object.entries(selectedMap).forEach(([sourcePlaylistId, set]) => {
      const ids = Array.from(set);
      if (ids.length > 0) {
        removeMutation.mutate({ playlistItemIds: ids, sourcePlaylistId });
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
      setTargetPlaylistId(null);
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

  React.useLayoutEffect(() => {
    const update = () => {
      const w =
        rowRef.current?.scrollWidth ??
        bottomScrollRef.current?.scrollWidth ??
        0;
      setContentWidth(w);
    };

    update();

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

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (authQ.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (authQ.isError || !auth) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load authentication status. Please refresh.
      </div>
    );
  }
  // ✅ 只看 authenticated
  if (!auth.authenticated) {
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
              selectedPlaylistId={targetPlaylistId} // ✅ 受控目標清單
              onTargetChange={setTargetPlaylistId} // ✅ 受控回傳
              onAdd={handleAddSelected}
              onRemove={handleRemoveSelected}
              onMove={(tid?: string | null) => handleMoveSelected(tid)} // ✅ 帶入目標
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
