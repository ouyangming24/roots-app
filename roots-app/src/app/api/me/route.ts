import { sql } from "@/lib/db";
import { viewerFromRequest } from "@/lib/auth";
import type { StatsRow } from "@/lib/types";

export const dynamic = "force-dynamic";

async function ensureStats(owner: string): Promise<StatsRow> {
  await sql(
    `insert into user_stats (owner) values ($1)
     on conflict (owner) do nothing`,
    [owner],
  );
  const rows = await sql<StatsRow>(
    `select streak_days, last_study_date::text, total_study_ms, daily_new_target,
            daily_review_target, theme, sound_enabled, onboarding_done
     from user_stats where owner = $1`,
    [owner],
  );
  return rows[0];
}

export async function GET(request: Request) {
  const viewer = await viewerFromRequest(request);
  if (viewer instanceof Response) return viewer;
  const stats = await ensureStats(viewer.sub);
  return Response.json(
    { viewer, stats },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function PATCH(request: Request) {
  const viewer = await viewerFromRequest(request);
  if (viewer instanceof Response) return viewer;
  await ensureStats(viewer.sub);
  const body = (await request.json()) as Partial<{
    daily_new_target: number;
    daily_review_target: number;
    theme: string;
    sound_enabled: boolean;
    onboarding_done: boolean;
  }>;

  await sql(
    `update user_stats set
       daily_new_target = coalesce($2, daily_new_target),
       daily_review_target = coalesce($3, daily_review_target),
       theme = coalesce($4, theme),
       sound_enabled = coalesce($5, sound_enabled),
       onboarding_done = coalesce($6, onboarding_done),
       updated_at = now()
     where owner = $1`,
    [
      viewer.sub,
      body.daily_new_target ?? null,
      body.daily_review_target ?? null,
      body.theme ?? null,
      body.sound_enabled ?? null,
      body.onboarding_done ?? null,
    ],
  );
  const stats = await ensureStats(viewer.sub);
  return Response.json(
    { stats },
    { headers: { "cache-control": "private, no-store" } },
  );
}
