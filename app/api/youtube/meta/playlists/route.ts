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
    if (ids.length === 0) return jsonOk({ names: {} });

    const { yt, mock } = await getYouTubeClientEx({
      userId: auth.userId,
      requireReal: false,
    });
    const names: Record<string, string> = {};

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      if (mock || !yt) {
        for (const id of batch) names[id] = `Playlist ${id.slice(0, 6)}…`;
        continue;
      }
      const resp = await yt.playlists.list({
        id: batch,
        part: ["snippet"],
        maxResults: 50,
      });
      for (const item of resp.data.items ?? []) {
        if (item.id) names[item.id] = item.snippet?.title ?? item.id;
      }
      // 沒回來的補上占位，避免前端空白
      for (const id of batch)
        if (!names[id]) names[id] = `Playlist ${id.slice(0, 6)}…`;
    }

    return jsonOk({ names });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return jsonError("internal_error", msg, { status: 500 });
  }
}
