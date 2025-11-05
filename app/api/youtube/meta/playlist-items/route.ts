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
    if (ids.length === 0)
      return jsonOk({ titlesByPlaylistItemId: {}, titlesByVideoId: {} });

    const { yt, mock } = await getYouTubeClientEx({
      userId: auth.userId,
      requireReal: false,
    });
    const titlesByPlaylistItemId: Record<string, string> = {};
    const titlesByVideoId: Record<string, string> = {};

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      if (mock || !yt) {
        for (const id of batch)
          titlesByPlaylistItemId[id] = `Video ${id.slice(0, 6)}…`;
        continue;
      }
      const resp = await yt.playlistItems.list({
        id: batch,
        part: ["snippet"],
        maxResults: 50,
      });
      for (const item of resp.data.items ?? []) {
        const piId = item.id!;
        const title = item.snippet?.title ?? piId;
        titlesByPlaylistItemId[piId] = title;
        const vId = item.snippet?.resourceId?.videoId;
        if (vId) titlesByVideoId[vId] = title;
      }
      for (const id of batch)
        if (!titlesByPlaylistItemId[id])
          titlesByPlaylistItemId[id] = `Video ${id.slice(0, 6)}…`;
    }

    return jsonOk({ titlesByPlaylistItemId, titlesByVideoId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return jsonError("internal_error", msg, { status: 500 });
  }
}
