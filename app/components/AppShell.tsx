"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, History, ListMusic } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/app/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  // 手機：覆蓋式側欄
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // 桌機：內嵌側欄收合
  const [desktopOpen, setDesktopOpen] = React.useState(true);

  const NavItems = (
    <nav className="space-y-1 p-4">
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
          "text-foreground"
        )}
      >
        <ListMusic className="h-4 w-4" />
        Playlist Management
      </Link>
      <Link
        href="/action-log"
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
          "text-muted-foreground"
        )}
      >
        <History className="h-4 w-4" />
        Action Log
      </Link>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar（桌機，內嵌可收合） */}
      <aside
        className={cn(
          "hidden md:flex md:flex-col border-r bg-background overflow-hidden transition-[width] duration-200",
          desktopOpen ? "w-56" : "w-0"
        )}
        aria-hidden={!desktopOpen}
      >
        {/* 展開時才渲染內容，避免 tab 停留在收合區塊 */}
        {desktopOpen ? NavItems : null}
      </aside>

      {/* 手機側欄（Radix Sheet 覆蓋式） */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          {NavItems}
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4">
            {/* 手機：打開 Sheet */}
            <button
              aria-label="Open navigation"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* 桌機：切換內嵌側欄寬度 */}
            <button
              aria-label="Toggle sidebar"
              aria-expanded={desktopOpen}
              className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
              onClick={() => setDesktopOpen((v) => !v)}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="text-base font-semibold">yt-playlist-manager</div>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
