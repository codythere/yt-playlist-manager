"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, History, ListMusic } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function AppShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  /** 可選：頁面底部區塊（例如 <Footer />），會貼齊底部 */
  footer?: React.ReactNode;
}) {
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
      {/* Sidebar（桌機固定版） */}
      <aside
        className={cn(
          "hidden md:flex md:flex-col fixed left-0 top-0 h-screen border-r bg-background overflow-hidden transition-[width] duration-200",
          desktopOpen ? "w-56" : "w-0"
        )}
        aria-hidden={!desktopOpen}
      >
        {desktopOpen ? NavItems : null}
      </aside>

      {/* 手機側欄（Radix Sheet 覆蓋式） */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader>
            <VisuallyHidden>
              <SheetTitle>Navigation</SheetTitle>
            </VisuallyHidden>
          </SheetHeader>
          {NavItems}
        </SheetContent>
      </Sheet>

      {/* 內容區：預留固定側欄空間 + 欄式排版（header / main / footer） */}
      <div
        className={cn(
          "flex-1 transition-all duration-200",
          desktopOpen ? "md:ml-56" : "md:ml-0"
        )}
      >
        <div className="flex min-h-screen flex-col">
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

              {/* 桌機：切換固定側欄寬度 */}
              <button
                aria-label="Toggle sidebar"
                aria-expanded={desktopOpen}
                className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                onClick={() => setDesktopOpen((v) => !v)}
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-1.5 text-base font-semibold">
                <Image src="/logo.png" alt="App Logo" width={20} height={20} />
                YT Playlist Manager
              </div>
            </div>
          </header>

          {/* 撐開剩餘高度的主內容 */}
          <main className="flex-1 p-6">{children}</main>

          {/* 會貼齊底部的 Footer（可選） */}
          {footer ?? null}
        </div>
      </div>
    </div>
  );
}
