// /app/components/ActionsToolbar.tsx
"use client";
import * as React from "react";
import { Button } from "@/app/components/ui/button";
import type { PlaylistSummary } from "@/types/youtube";
import { Loader2 } from "lucide-react";

export interface ActionsToolbarProps {
  selectedCount: number;
  playlists: PlaylistSummary[];

  /** 受控目標清單（可為 null） */
  selectedPlaylistId?: string | null;
  /** 受控模式：目標變更回呼（可選） */
  onTargetChange?: (id: string | null) => void;

  /** ✅ 讓 onAdd 也吃 targetId（和 onMove 一致） */
  onAdd: (targetId?: string | null) => void;
  onRemove: () => void;
  /** 可接受 targetId；若父層不傳，仍可維持舊介面呼叫 `onMove()` */
  onMove: (targetId?: string | null) => void;
  onUndo: () => void;

  /** 相容舊版：全域鎖（若提供，會併入三顆按鈕的 disabled） */
  isLoading?: boolean;

  /** 估算配額（顯示用） */
  estimatedQuota?: number;

  /** ✅ 進階版：各自的 loading（優先於 isLoading） */
  addLoading?: boolean;
  removeLoading?: boolean;
  moveLoading?: boolean;

  /** ✅ 是否可復原（控制 Undo 按鈕啟用） */
  canUndo?: boolean;
}

export function ActionsToolbar(props: ActionsToolbarProps) {
  const {
    selectedCount,
    playlists,
    selectedPlaylistId,
    onTargetChange,
    onAdd,
    onRemove,
    onMove,
    onUndo,
    isLoading,
    estimatedQuota,
    addLoading,
    removeLoading,
    moveLoading,
    canUndo,
  } = props;

  // 非受控：自己保留目標值
  const [localTargetId, setLocalTargetId] = React.useState<string | null>(null);

  // 若父層有提供 selectedPlaylistId，則視為受控值；否則用自己的
  const currentTargetId =
    typeof selectedPlaylistId !== "undefined"
      ? selectedPlaylistId
      : localTargetId;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value || null;
    if (onTargetChange) onTargetChange(v);
    else setLocalTargetId(v);
  };

  // 全域忙碌（相容舊版）
  const busyAll = Boolean(isLoading);

  // ✅ 各鍵最終狀態（個別優先 → 退回全域）
  const addBusy = Boolean(addLoading) || busyAll;
  const removeBusy = Boolean(removeLoading) || busyAll;
  const moveBusy = Boolean(moveLoading) || busyAll;

  // 共用禁用條件
  const nothingSelected = selectedCount === 0;

  // 目標清單下拉：新增/移轉進行中時鎖住，避免操作中途改目標
  const targetDisabled = addBusy || moveBusy;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <div className="text-sm">
        已勾選：<b>{selectedCount}</b> 部影片{" "}
        {typeof estimatedQuota === "number" ? (
          <span className="text-muted-foreground">
            （估算配額 {estimatedQuota}）
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={currentTargetId ?? ""}
          onChange={handleSelectChange}
          disabled={targetDisabled}
          aria-label="目標播放清單"
        >
          <option value="">選擇目標播放清單</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        {/* 新增到清單（需選目標且有勾選） */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onAdd(currentTargetId)}
          disabled={addBusy || nothingSelected || !currentTargetId}
          aria-disabled={addBusy || nothingSelected || !currentTargetId}
        >
          {addBusy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              新增中…
            </>
          ) : (
            "新增到清單"
          )}
        </Button>

        {/* 從原清單移除（不需目標） */}
        <Button
          size="sm"
          variant="outline"
          onClick={onRemove}
          disabled={removeBusy || nothingSelected}
          aria-disabled={removeBusy || nothingSelected}
        >
          {removeBusy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              移除中…
            </>
          ) : (
            "從原清單移除"
          )}
        </Button>

        {/* 一併移轉（需選目標且有勾選） */}
        <Button
          size="sm"
          onClick={() => onMove(currentTargetId)}
          disabled={moveBusy || nothingSelected || !currentTargetId}
          aria-disabled={moveBusy || nothingSelected || !currentTargetId}
        >
          {moveBusy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              移轉中…
            </>
          ) : (
            "一併移轉"
          )}
        </Button>

        {/* 復原：只有有可復原動作時才可按 */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onUndo}
          disabled={busyAll || !canUndo}
          aria-disabled={busyAll || !canUndo}
          title={canUndo ? "復原上一個動作" : "暫無可復原的動作"}
        >
          復原
        </Button>
      </div>
    </div>
  );
}

export default ActionsToolbar;
