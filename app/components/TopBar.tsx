"use client";

import * as React from "react";
import { Menu } from "lucide-react";

export function TopBar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <button
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="text-base font-semibold">YT Playlist Manager</div>
      </div>
    </header>
  );
}
