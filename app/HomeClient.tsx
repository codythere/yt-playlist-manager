"use client";

import * as React from "react";
import type { PlaylistSummary, PlaylistItemSummary } from "@/types/youtube";
import { Button } from "@/app/components/ui/button";
import { ActionsToolbar } from "@/app/components/ActionsToolbar";
import { PlaylistList } from "@/app/components/PlaylistList";
import { TopBar } from "@/app/components/TopBar";
import { Checkbox } from "@/app/components/ui/checkbox";
import Image from "next/image";
import { cn } from "@/lib/utils";

type View = "select-playlists" | "manage-items";

/** ---- 假資料生成工具：若某清單沒有 items，就生成幾筆 ---- */
function mockItemsFor(pid: string): PlaylistItemSummary[] {
  return Array.from({ length: 6 }).map((_, i) => ({
    playlistItemId: `${pid}_${i + 1}`,
    videoId: `v_${pid}_${i + 1}`,
    title: `Video #${i + 1} of ${pid}`,
    channelTitle: `Channel ${i + 1}`,
    thumbnailUrl: "",
  }));
}

/** ---- 單一 Playlist 直欄（UI 稿件 2 的最下方區塊每一欄） ---- */
function PlaylistColumn(props: {
  playlist: PlaylistSummary;
  items: PlaylistItemSummary[];
  selectedItemIds: Set<string>;
  onToggleItem: (item: PlaylistItemSummary, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const { playlist, items, selectedItemIds, onToggleItem, onToggleAll } = props;
  const allSelected =
    items.length > 0 &&
    items.every((x) => selectedItemIds.has(x.playlistItemId));

  return (
    <div className="min-w-[340px] w-[340px] shrink-0 rounded-lg border bg-card shadow-sm">
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

      <div className="flex flex-col gap-2 p-3">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground px-1 py-6 text-center">
            此播放清單暫無影片
          </div>
        ) : (
          items.map((item) => {
            const checked = selectedItemIds.has(item.playlistItemId);
            return (
              <label
                key={item.playlistItemId}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-md border bg-background p-2 transition",
                  checked && "border-primary ring-2 ring-primary/30"
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => onToggleItem(item, Boolean(c))}
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
                  <div className="line-clamp-2 text-sm font-medium">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.channelTitle}
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function HomeClient() {
  // ---------------- 假資料（之後換成 API / Query） ----------------
  const [allPlaylists] = React.useState<PlaylistSummary[]>([
    { id: "PL_A", title: "Eng Songs", itemCount: 132, thumbnailUrl: "" },
    { id: "PL_B", title: "Pop Eng Songs", itemCount: 24, thumbnailUrl: "" },
    { id: "PL_C", title: "BGM (Repeatable)", itemCount: 27, thumbnailUrl: "" },
    { id: "PL_D", title: "Software GEM", itemCount: 13, thumbnailUrl: "" },
    { id: "PL_E", title: "Mindset GEM", itemCount: 3, thumbnailUrl: "" },
  ]);

  // 讓幾個清單先有固定的假資料
  const [itemsByPlaylist] = React.useState<
    Record<string, PlaylistItemSummary[]>
  >({
    PL_A: mockItemsFor("PL_A"),
    PL_B: mockItemsFor("PL_B"),
    PL_C: mockItemsFor("PL_C"),
    PL_D: mockItemsFor("PL_D"),
    PL_E: mockItemsFor("PL_E"),
  });

  // ---------------- 流程狀態 ----------------
  const [view, setView] = React.useState<View>("select-playlists");

  // UI 稿件 1：多選播放清單
  const [checkedPlaylistIds, setCheckedPlaylistIds] = React.useState<
    Set<string>
  >(() => new Set<string>(["PL_A", "PL_B", "PL_C"]));

  // UI 稿件 2：各 playlist 的「選到哪些影片」
  const [selectedMap, setSelectedMap] = React.useState<
    Record<string, Set<string>>
  >({});

  // ---- 稿件 1 行為：切換勾選清單 ----
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

  // ---- 稿件 2：取已確認的清單與影片 ----
  const confirmedPlaylists = allPlaylists.filter((p) =>
    checkedPlaylistIds.has(p.id)
  );
  const columns = confirmedPlaylists.map((p) => ({
    playlist: p,
    items: itemsByPlaylist[p.id] ?? mockItemsFor(p.id),
  }));

  // ---- 稿件 2：選取影片（每個 playlist 獨立狀態） ----
  const toggleItem = (
    pid: string,
    item: PlaylistItemSummary,
    checked: boolean
  ) => {
    setSelectedMap((prev) => {
      const cur = new Set(prev[pid] ?? []);
      if (checked) cur.add(item.playlistItemId);
      else cur.delete(item.playlistItemId);
      return { ...prev, [pid]: cur };
    });
  };
  const toggleAllInPlaylist = (pid: string, checked: boolean) => {
    setSelectedMap((prev) => {
      const allIds = (itemsByPlaylist[pid] ?? []).map((i) => i.playlistItemId);
      const cur = checked ? new Set(allIds) : new Set<string>();
      return { ...prev, [pid]: cur };
    });
  };

  // ---- 動作列：計算總選取數量 ----
  const totalSelectedCount = React.useMemo(
    () =>
      Object.values(selectedMap).reduce((sum, s) => sum + (s?.size ?? 0), 0),
    [selectedMap]
  );
  const estimatedQuota = totalSelectedCount * 50;

  // ---- ActionsToolbar 的行為（示意：跨多個 playlist 一起處理） ----
  const onAdd = () => {
    console.log("一併加入", selectedMap);
  };
  const onRemove = () => {
    console.log("一併移除", selectedMap);
  };
  const onMove = (toPlaylistId: string) => {
    console.log("一併移轉", { to: toPlaylistId, fromMany: selectedMap });
  };
  const onUndo = () => console.log("動作回復");
  // ── 返回 UI 稿件 1
  const backToSelect = () => setView("select-playlists");

  // ---------------- Render ----------------
  return (
    <div className="min-h-dvh">
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
              <Button onClick={onConfirmSelect}>確認</Button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xl font-semibold">播放清單</div>
            <PlaylistList
              playlists={allPlaylists}
              selectable
              selectedIds={checkedPlaylistIds}
              onToggleSelect={toggleSelectPlaylist}
            />
          </section>
        </main>
      ) : (
        /* ---------- UI 稿件 2：上/中/下 三段 ---------- */
        <main className="mx-auto max-w-[1200px] p-6 space-y-8">
          <section className="flex justify-end">
            <Button variant="ghost" onClick={backToSelect}>
              ← 返回選取播放清單
            </Button>
          </section>
          {/* 上：已確認清單 Chips */}
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

          {/* 中：主要功能按鈕（統計的是所有欄位的勾選總和） */}
          <section>
            <ActionsToolbar
              selectedCount={totalSelectedCount}
              playlists={allPlaylists}
              selectedPlaylistId={null} // 不鎖定單一清單
              onAdd={onAdd}
              onRemove={onRemove}
              onMove={onMove}
              onUndo={onUndo}
              isLoading={false}
              estimatedQuota={estimatedQuota}
            />
          </section>

          {/* 下：水平可捲動的清單欄位 */}
          <section className="space-y-3">
            <div className="text-xl font-semibold">播放清單</div>

            <div className="relative">
              <div className="overflow-x-auto pb-2">
                <div className="flex w-max gap-4">
                  {columns.map(({ playlist, items }) => (
                    <PlaylistColumn
                      key={playlist.id}
                      playlist={playlist}
                      items={items}
                      selectedItemIds={selectedMap[playlist.id] ?? new Set()}
                      onToggleItem={(item, c) =>
                        toggleItem(playlist.id, item, c)
                      }
                      onToggleAll={(c) => toggleAllInPlaylist(playlist.id, c)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
