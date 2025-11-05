"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export interface DropdownSelectOption {
  label: React.ReactNode;
  value: string;
}

export function DropdownSelect({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  className,
  triggerWidth = 112,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: DropdownSelectOption[];
  "aria-label"?: string;
  className?: string;
  triggerWidth?: number;
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-8 items-center justify-between rounded-md border bg-background px-3 text-sm",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
            className
          )}
          style={{ width: triggerWidth }}
        >
          <span className="truncate">{selected?.label ?? "Select"}</span>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          // DropdownMenu 可以很自然地達到非 modal 的體感
          // 並不會鎖 body，也不會造成捲軸顯示/隱藏抖動
          sideOffset={6}
          className={cn(
            "z-50 min-w-[8rem] rounded-md border bg-popover text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <DropdownMenu.Item
                key={opt.value}
                onSelect={(e) => {
                  e.preventDefault();
                  onValueChange(opt.value);
                }}
                className={cn(
                  "relative flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-sm outline-none",
                  "focus:bg-accent focus:text-accent-foreground"
                )}
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {active ? <Check className="h-4 w-4" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
