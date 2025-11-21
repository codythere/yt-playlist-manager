// lib/quota.ts
import "server-only";
import { addUsage, getUsage } from "./quota-db"; // ← PG + async

export const METHOD_COST = {
  "playlistItems.list": 1,
  "playlistItems.insert": 50,
  "playlistItems.delete": 50,
  "playlists.list": 1,
} as const;

export type MethodName = keyof typeof METHOD_COST;

/** 🔁 quota 模式：現在用 global，以後可以切 perUser */
export type QuotaMode = "global" | "perUser";

/** 目前模式：預設 global（所有 user 共用一桶） */
export const QUOTA_MODE: QuotaMode =
  (process.env.YTPM_QUOTA_MODE as QuotaMode) ?? "global";

const DAILY_BUDGET =
  Number(
    process.env.YTPM_DAILY_QUOTA ?? process.env.NEXT_PUBLIC_YTPM_DAILY_QUOTA
  ) || 10_0000;

/** 產生 PT（美國太平洋時間）當日 key：YYYY-MM-DD */
function todayKeyPT() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

/** 回傳下次 PT 午夜 ISO */
function nextResetAtISO_PT() {
  const nowPT = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  const nextPT = new Date(nowPT);
  nextPT.setDate(nowPT.getDate() + 1);
  nextPT.setHours(0, 0, 0, 0);

  const yyyy = nextPT.getFullYear();
  const mm = String(nextPT.getMonth() + 1).padStart(2, "0");
  const dd = String(nextPT.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T00:00:00-08:00`;
}

function toSafeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/**
 * 統一處理 user 對應到 quota_usage.scope 的格式
 * 現在先直接用 userId（和你原本一樣），
 * 將來如果要改成 `user:${userId}` 只要改這裡即可。
 */
function userScope(userId: string): string {
  return userId;
  // return `user:${userId}`; // 將來想換命名空間只改這裡
}

/** ✅ 寫入配額（global + userId）→ async */
export async function recordQuota(
  _method: MethodName | string,
  units: number,
  userId?: string
): Promise<void> {
  const n = toSafeInt(units, 0);
  if (!n) return;

  const tk = todayKeyPT();

  const tasks: Promise<unknown>[] = [];

  // 一律寫 global → 代表全專案共用那一桶
  tasks.push(addUsage(tk, "global", n));

  // 有 userId 時，同步寫一份 user 用量（為未來 perUser 模式預做紀錄）
  if (userId) {
    tasks.push(addUsage(tk, userScope(userId), n));
  }

  await Promise.all(tasks);
}

/** ✅ 讀取今日配額：依 QUOTA_MODE 切換 global / perUser */
export async function getTodayQuota(userId?: string): Promise<{
  mode: QuotaMode;
  used: number; // 目前「真的拿來算 quota」的用量
  remain: number;
  budget: number;
  resetAtISO: string;
  globalUsed: number; // 全站今天總共用了多少
  userUsed: number; // 這個 user 自己今天用了多少（沒登入就 0）
}> {
  const tk = todayKeyPT();
  const resetAtISO = nextResetAtISO_PT();

  const [rawGlobalUsed, rawUserUsed] = await Promise.all([
    getUsage(tk, "global"),
    userId ? getUsage(tk, userScope(userId)) : Promise.resolve(0),
  ]);

  const globalUsed = toSafeInt(rawGlobalUsed, 0);
  const userUsed = toSafeInt(rawUserUsed, 0);

  let effectiveUsed: number;

  if (QUOTA_MODE === "perUser" && userId) {
    // 🔁 將來若改成 perUser 模式 → 每個 user 自己一桶
    effectiveUsed = userUsed;
  } else {
    // 目前模式：global → 所有人共用 global 那一桶
    effectiveUsed = globalUsed;
  }

  const budget = DAILY_BUDGET;
  const remain = Math.max(0, budget - effectiveUsed);

  return {
    mode: QUOTA_MODE,
    used: effectiveUsed,
    remain,
    budget,
    resetAtISO,
    globalUsed,
    userUsed,
  };
}

/** 保留舊 API（不扣點） */
export async function runWithQuota<T>(
  _method: MethodName | string,
  _cost: number,
  fn: () => Promise<T>
): Promise<T> {
  return fn();
}
