"use client";

import Link from "next/link";
import { Github } from "lucide-react";
// 讀版本號：
import pkg from "../../package.json"; // 視你實際路徑調整

export function Footer() {
  const version = pkg.version;

  return (
    <footer
      aria-label="Legal and safety notes"
      className="mt-10 border-t px-4 py-6 text-xs text-muted-foreground"
    >
      <div className="mx-auto max-w-screen-xl space-y-4 leading-relaxed">
        {/* 安全說明文字 */}
        <div className="space-y-1">
          <p>
            - 本工具僅在使用者登入期間使用其帳號授權操作，不會將 YouTube Data
            長期寫入資料庫或傳給第三方。
          </p>
          <p>- 不提供內容下載、匯出或對外同步。</p>
          <p>
            - 任何批次操作都需要使用者手動點擊並二次確認，不會在背景輪詢或執行。
          </p>
          <p>
            - 當配額不足（<code>quotaExceeded</code>
            ）時，明確告知使用者並暫停對應功能。
          </p>
        </div>

        {/* GitHub / Version Info */}
        <div className="flex items-center justify-between pt-4 border-t text-[11px] text-muted-foreground">
          <div>YT Playlist Manager · v{version}</div>

          <Link
            href="https://github.com/codythere/yt-playlist-manager"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </Link>
        </div>
      </div>
    </footer>
  );
}
