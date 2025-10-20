"use client";

import Image from "next/image";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { PlaylistSummary } from "@/types/youtube";
import { Card } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";

export interface PlaylistListProps {
  playlists: PlaylistSummary[];
  activeId?: string;
  onSelect?: (playlistId: string) => void;
  isLoading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (playlistId: string, checked: boolean) => void;
}

export function PlaylistList({
  playlists,
  activeId,
  onSelect,
  isLoading,
  selectable = true,
  selectedIds,
  onToggleSelect,
}: PlaylistListProps) {
  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading playlists</div>
    );
  }

  if (!playlists.length) {
    return (
      <div className="text-sm text-muted-foreground">No playlists found.</div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {playlists.map((playlist) => {
        const isActive = playlist.id === activeId;
        const isChecked = selectedIds?.has(playlist.id) ?? false;

        const handleClick = () => {
          if (selectable && onToggleSelect) {
            onToggleSelect(playlist.id, !isChecked);
          } else {
            onSelect?.(playlist.id);
          }
        };

        return (
          <div
            key={playlist.id}
            role="button"
            tabIndex={0}
            onClick={handleClick}
            className={cn(
              "relative cursor-pointer text-left",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
            )}
          >
            {/* ✅ Checkbox 直接放上層，移除外層 div */}
            {selectable && (
              <Checkbox
                checked={isChecked}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={(checked) =>
                  onToggleSelect?.(playlist.id, Boolean(checked))
                }
                className="absolute right-2 top-2 z-10 bg-background/80 rounded shadow"
                aria-label={isChecked ? "Unselect playlist" : "Select playlist"}
              />
            )}

            <Card
              className={cn(
                "flex h-full flex-col overflow-hidden border transition-shadow hover:shadow-md",
                (isActive || isChecked) && "border-primary shadow-lg"
              )}
            >
              {playlist.thumbnailUrl ? (
                <div className="relative h-36 w-full overflow-hidden">
                  <Image
                    src={playlist.thumbnailUrl}
                    alt={playlist.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 300px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-36 w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                  No thumbnail
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1 px-4 py-3">
                <div className="text-sm font-semibold text-foreground line-clamp-2">
                  {playlist.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  Items: {playlist.itemCount}
                </div>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
