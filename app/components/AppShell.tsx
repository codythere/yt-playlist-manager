// /app/components/AppShell.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, History, ListMusic } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { AvatarMenu } from "@/app/components/AvatarMenu";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

type AuthMe = {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  usingMock: boolean;
};

export function AppShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [desktopOpen, setDesktopOpen] = React.useState(true);

  // ===== 取得 /api/auth/me =====
  const [me, setMe] = React.useState<AuthMe | null>(null);
  const [loadingMe, setLoadingMe] = React.useState(true);

  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setLoadingMe(true);
        const res = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
          headers: { "cache-control": "no-store" },
        });
        const data = (await res.json()) as AuthMe;
        if (!aborted) setMe(data);
      } catch {
        if (!aborted) setMe(null);
      } finally {
        if (!aborted) setLoadingMe(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

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

      {/* 手機側欄 */}
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

      {/* 內容區 */}
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

              {/* 桌機：切換固定側欄 */}
              <button
                aria-label="Toggle sidebar"
                aria-expanded={desktopOpen}
                className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                onClick={() => setDesktopOpen((v) => !v)}
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* 左側：Logo 與標題 */}
              <div className="flex items-center gap-1.5 text-base font-semibold">
                <Image src="/logo.png" alt="App Logo" width={20} height={20} />
                YT Playlist Manager
              </div>

              {/* 右側：使用者區塊（實際資料） */}
              <div className="ml-auto">
                {loadingMe ? (
                  <div className="h-7 w-28 rounded-full bg-muted animate-pulse" />
                ) : me?.authenticated ? (
                  <AvatarMenu
                    user={{
                      // 目前 /api/auth/me 沒回 name/image，就以 email 當顯示名稱
                      name: me.email ?? me.userId ?? "User",
                      email: me.email,
                      image: null,
                    }}
                    redirectTo="/login"
                  />
                ) : (
                  <button
                    className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent"
                    onClick={() => router.push("/login")}
                  >
                    Login
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 p-6">{children}</main>
          {footer ?? null}
        </div>
      </div>
    </div>
  );
}
