// /app/components/AvatarMenu.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Avatar } from "@/app/components/ui/avatar";
import { LogOut, Settings, User } from "lucide-react";

export function AvatarMenu({
  user,
  redirectTo = "/login",
}: {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  redirectTo?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const onLogout = async () => {
    try {
      setLoading(true);
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace(redirectTo);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-2 rounded-full px-2 py-1 hover:bg-accent 
                   focus:outline-none focus-visible:outline-none focus-visible:ring-0"
      >
        <Avatar
          src={user?.image ?? null}
          name={user?.name ?? user?.email ?? "U"}
          size={28}
        />
        <span className="hidden text-sm font-medium md:inline">
          {user?.name ?? user?.email ?? "User"}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-48">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {user?.email ?? ""}
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => router.push("/profile")}>
          <User className="mr-2 h-4 w-4" /> Profile
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings className="mr-2 h-4 w-4" /> Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onLogout}
          className="text-destructive"
          aria-disabled={loading}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {loading ? "Logging out…" : "Logout"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
