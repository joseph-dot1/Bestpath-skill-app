import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// YouTube Data API v3 client with quota accounting.
//
// Unit costs: search.list = 100, videos.list = 1, channels.list = 1.
// Daily budget defaults to Google's 10,000-unit free tier; we stop spending
// at SOFT_LIMIT so verification (cheap) never gets starved by search (dear).
// ---------------------------------------------------------------------------
const API_BASE = "https://www.googleapis.com/youtube/v3";
const DAILY_BUDGET = Number(process.env.YOUTUBE_DAILY_UNIT_BUDGET ?? 10_000);
const SOFT_LIMIT = Math.floor(DAILY_BUDGET * 0.9);

export function isYouTubeConfigured() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export class QuotaExceededError extends Error {
  constructor() {
    super("Daily YouTube API quota budget reached.");
  }
}

async function spendUnits(units: number) {
  const admin = createAdminClient();
  if (!admin) return; // tracking is best-effort; the call itself still runs
  const { data, error } = await admin.rpc("increment_youtube_units", { units });
  if (error) {
    console.error("quota tracking failed:", error);
    return;
  }
  if (typeof data === "number" && data > SOFT_LIMIT) {
    throw new QuotaExceededError();
  }
}

async function yt<T>(path: string, params: Record<string, string>, units: number): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set.");

  await spendUnits(units);

  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API_BASE}/${path}?${qs}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Typed slices of the API we actually use
// ---------------------------------------------------------------------------
export type SearchResult = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  description: string;
};

export type VideoDetails = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  durationSeconds: number;
  embeddable: boolean;
};

/** search.list — 100 units. Pass channelId to search inside one channel. */
export async function searchVideos(
  query: string,
  maxResults = 8,
  channelId?: string,
): Promise<SearchResult[]> {
  type Raw = {
    items?: {
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelId?: string;
        channelTitle?: string;
        description?: string;
      };
    }[];
  };
  const data = await yt<Raw>(
    "search",
    {
      part: "snippet",
      q: query,
      type: "video",
      maxResults: String(maxResults),
      relevanceLanguage: "en",
      videoEmbeddable: "true",
      order: "relevance",
      ...(channelId ? { channelId } : {}),
    },
    100,
  );
  return (data.items ?? [])
    .filter((i) => i.id?.videoId && i.snippet)
    .map((i) => ({
      videoId: i.id!.videoId!,
      title: i.snippet!.title ?? "",
      channelId: i.snippet!.channelId ?? "",
      channelTitle: i.snippet!.channelTitle ?? "",
      description: i.snippet!.description ?? "",
    }));
}

function parseISODuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

/** videos.list — 1 unit per call of up to 50 ids. This is the LIVE VERIFICATION step. */
export async function getVideoDetails(videoIds: string[]): Promise<VideoDetails[]> {
  if (videoIds.length === 0) return [];
  const out: VideoDetails[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    type Raw = {
      items?: {
        id?: string;
        snippet?: {
          title?: string;
          channelId?: string;
          channelTitle?: string;
          description?: string;
          publishedAt?: string;
        };
        statistics?: { viewCount?: string; likeCount?: string };
        contentDetails?: { duration?: string };
        status?: { embeddable?: boolean };
      }[];
    };
    const data = await yt<Raw>(
      "videos",
      {
        part: "snippet,statistics,contentDetails,status",
        id: videoIds.slice(i, i + 50).join(","),
      },
      1,
    );
    for (const item of data.items ?? []) {
      if (!item.id || !item.snippet) continue;
      out.push({
        videoId: item.id,
        title: item.snippet.title ?? "",
        channelId: item.snippet.channelId ?? "",
        channelTitle: item.snippet.channelTitle ?? "",
        description: item.snippet.description ?? "",
        publishedAt: item.snippet.publishedAt ?? "",
        viewCount: Number(item.statistics?.viewCount ?? 0),
        likeCount: Number(item.statistics?.likeCount ?? 0),
        durationSeconds: parseISODuration(item.contentDetails?.duration ?? ""),
        embeddable: item.status?.embeddable ?? false,
      });
    }
  }
  return out;
}

/** channels.list — 1 unit per call of up to 50 ids. Returns subscriber counts. */
export async function getChannelSubscribers(
  channelIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(channelIds)].filter(Boolean);
  const subs = new Map<string, number>();
  for (let i = 0; i < unique.length; i += 50) {
    type Raw = {
      items?: { id?: string; statistics?: { subscriberCount?: string } }[];
    };
    const data = await yt<Raw>(
      "channels",
      { part: "statistics", id: unique.slice(i, i + 50).join(",") },
      1,
    );
    for (const item of data.items ?? []) {
      if (item.id) subs.set(item.id, Number(item.statistics?.subscriberCount ?? 0));
    }
  }
  return subs;
}
