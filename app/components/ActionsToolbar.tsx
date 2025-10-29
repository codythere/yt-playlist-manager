// /app/components/ActionsToolbar.tsx
"use client";
import * as React from "react";
import { Button } from "@/app/components/ui/button";
import type { PlaylistSummary } from "@/types/youtube";

export interface ActionsToolbarProps {
  selectedCount: number;
  playlists: PlaylistSummary[];
  /** 受控目標清單（可為 null） */
  selectedPlaylistId?: string | null;
  /** 受控模式：目標變更回呼（可選） */
  onTargetChange?: (id: string | null) => void;

  onAdd: () => void;
  onRemove: () => void;
  /** 可接受 targetId；若父層不傳，仍可維持舊介面呼叫 `onMove()` */
  onMove: (targetId?: string | null) => void;
  onUndo: () => void;

  isLoading?: boolean;
  estimatedQuota?: number;
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
  } = props;

  // 非受控：自己保留
  const [localTargetId, setLocalTargetId] = React.useState<string | null>(null);

  // 若父層有提供 selectedPlaylistId，則視為受控值；否則用自己的
  const currentTargetId =
    typeof selectedPlaylistId !== "undefined"
      ? selectedPlaylistId
      : localTargetId;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value || null;

    if (onTargetChange) {
      onTargetChange(v);
    } else {
      setLocalTargetId(v);
    }
  };

  const disabled = isLoading || selectedCount === 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <div className="text-sm">
        已勾選：<b>{selectedCount}</b> 部影片
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
        >
          <option value="">選擇目標播放清單</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <Button
          type="button" // ✅ 明確指定
          size="sm"
          variant="secondary"
          onClick={onAdd}
          disabled={disabled}
        >
          新增到清單
        </Button>

        <Button
          type="button" // ✅ 明確指定
          size="sm"
          variant="outline"
          onClick={onRemove}
          disabled={disabled}
        >
          從原清單移除
        </Button>

        {/* 呼叫 onMove 並把目前選取目標帶出去 */}
        <Button
          type="button" // ✅ 明確指定
          size="sm"
          onClick={() => onMove(currentTargetId)}
          disabled={disabled || !currentTargetId}
        >
          一併移轉
        </Button>

        <Button
          type="button" // ✅ 明確指定
          size="sm"
          variant="ghost"
          onClick={onUndo}
        >
          復原
        </Button>
      </div>
    </div>
  );
}

export default ActionsToolbar;
