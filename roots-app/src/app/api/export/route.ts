import { sql } from "@/lib/db";
import { ownerFromRequest } from "@/lib/auth";
import type { ProgressRow, SessionRow, StatsRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (owner instanceof Response) return owner;

  const progress = await sql<ProgressRow>(
    `select entry_id, ease_factor, interval_days, repetitions,
            next_review_at::text, last_reviewed_at::text, status, lapses,
            correct_count, wrong_count, note
     from user_progress where owner = $1`,
    [owner],
  );
  const sessions = await sql<SessionRow>(
    `select id, mode, started_at::text, ended_at::text, duration_ms,
            total_items, correct_items, entry_ids
     from practice_sessions where owner = $1 order by started_at desc`,
    [owner],
  );
  const stats = await sql<StatsRow>(
    `select streak_days, last_study_date::text, total_study_ms, daily_new_target,
            daily_review_target, theme, sound_enabled, onboarding_done
     from user_stats where owner = $1`,
    [owner],
  );

  return Response.json(
    {
      exportedAt: new Date().toISOString(),
      version: 1,
      progress,
      sessions,
      stats: stats[0] ?? null,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const owner = await ownerFromRequest(request);
  if (owner instanceof Response) return owner;
  const body = (await request.json()) as {
    progress?: ProgressRow[];
    stats?: Partial<StatsRow> | null;
  };

  for (const p of body.progress ?? []) {
    await sql(
      `insert into user_progress (
         owner, entry_id, ease_factor, interval_days, repetitions, next_review_at,
         last_reviewed_at, status, lapses, correct_count, wrong_count, note, updated_at
       ) values ($1,$2,$3,$4,$5,coalesce($6::timestamptz, now()),$7::timestamptz,$8,$9,$10,$11,$12, now())
       on conflict (owner, entry_id) do update set
         ease_factor = excluded.ease_factor,
         interval_days = excluded.interval_days,
         repetitions = excluded.repetitions,
         next_review_at = excluded.next_review_at,
         last_reviewed_at = excluded.last_reviewed_at,
         status = excluded.status,
         lapses = excluded.lapses,
         correct_count = excluded.correct_count,
         wrong_count = excluded.wrong_count,
         note = excluded.note,
         updated_at = now()`,
      [
        owner,
        p.entry_id,
        p.ease_factor,
        p.interval_days,
        p.repetitions,
        p.next_review_at,
        p.last_reviewed_at,
        p.status,
        p.lapses,
        p.correct_count,
        p.wrong_count,
        p.note ?? "",
      ],
    );
  }

  if (body.stats) {
    await sql(
      `insert into user_stats (
         owner, streak_days, last_study_date, total_study_ms, daily_new_target,
         daily_review_target, theme, sound_enabled, onboarding_done
       ) values ($1,$2,$3::date,$4,$5,$6,$7,$8,$9)
       on conflict (owner) do update set
         streak_days = excluded.streak_days,
         last_study_date = excluded.last_study_date,
         total_study_ms = excluded.total_study_ms,
         daily_new_target = excluded.daily_new_target,
         daily_review_target = excluded.daily_review_target,
         theme = excluded.theme,
         sound_enabled = excluded.sound_enabled,
         onboarding_done = excluded.onboarding_done,
         updated_at = now()`,
      [
        owner,
        body.stats.streak_days ?? 0,
        body.stats.last_study_date,
        body.stats.total_study_ms ?? 0,
        body.stats.daily_new_target ?? 8,
        body.stats.daily_review_target ?? 20,
        body.stats.theme ?? "light",
        body.stats.sound_enabled ?? true,
        body.stats.onboarding_done ?? false,
      ],
    );
  }

  return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}
