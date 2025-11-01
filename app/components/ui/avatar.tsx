// /app/components/ui/avatar.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  src,
  alt,
  name = "",
  className,
  size = 28,
}: {
  src?: string | null;
  alt?: string;
  name?: string;
  className?: string;
  size?: number;
}) {
  const initials = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-muted text-foreground",
        className
      )}
      style={{ width: size, height: size }}
      aria-label={alt ?? name ?? "avatar"}
    >
      {src ? (
        // 你可改成 next/image
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? name ?? "avatar"}
          style={{ width: size, height: size, borderRadius: "9999px" }}
        />
      ) : (
        <span className="text-xs font-medium">{initials}</span>
      )}
    </div>
  );
}
