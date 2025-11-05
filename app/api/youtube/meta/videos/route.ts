import type { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/result";
import { requireUserId } from "@/lib/auth";
import { getYouTubeClientEx } from "@/lib/google";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUserId(req);
    if (!auth)
      return jsonError("unauthorized", "Sign in required", { status: 401 });

    const idsRaw = new URL(req.url).searchParams.get("ids") || "";
    const ids = idsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return jsonOk({ titles: {} });

    const { yt, mock } = await getYouTubeClientEx({
      userId: auth.userId,
      requireReal: false,
    });
    const titles: Record<string, string> = {};

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      if (mock || !yt) {
        for (const id of batch) titles[id] = `Video ${id.slice(0, 6)}…`;
        continue;
      }
      const resp = await yt.videos.list({
        id: batch,
        part: ["snippet"],
        maxResults: 50,
      });
      for (const item of resp.data.items ?? []) {
        if (item.id) titles[item.id] = item.snippet?.title ?? item.id;
      }
      for (const id of batch)
        if (!titles[id]) titles[id] = `Video ${id.slice(0, 6)}…`;
    }

    return jsonOk({ titles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return jsonError("internal_error", msg, { status: 500 });
  }
}
