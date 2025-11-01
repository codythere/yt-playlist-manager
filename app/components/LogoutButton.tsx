// /app/components/LogoutButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Loader2, LogOut } from "lucide-react";

export function LogoutButton({
  redirectTo = "/",
  size = "sm",
  variant = "ghost",
  title = "Log out",
}: {
  redirectTo?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  title?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const onLogout = async () => {
    try {
      setLoading(true);
      await fetch("/api/auth/logout", { method: "POST" });
      // 清掉前端任何快取（如果你用 react-query，可以在這邊做 clear）
      router.replace(redirectTo);
      // 有些瀏覽器/快取狀況下，以 reload 保證乾淨狀態
      // window.location.href = redirectTo;
    } catch (e) {
      // 失敗就回首頁以確保離開需要登入的頁面
      router.replace(redirectTo);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={onLogout}
      aria-disabled={loading}
      title={title}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Logging out…
        </>
      ) : (
        <>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </>
      )}
    </Button>
  );
}
