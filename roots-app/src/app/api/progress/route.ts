import { sql } from "@/lib/db";
import { ownerFromRequest } from "@/lib/auth";
import { applySrs, type SrsState } from "@/lib/srs";
import type { Grade, ProgressRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function bumpStreak(owner: string) {
  const rows = await sql<{ last_study_date: string | null; streak_days: number }>(
    `select last_study_date::text, streak_days from user_stats where owner = $1`,
    [owner],
  );
  if (!rows[0]) {
    await sql(
      `insert into user_stats (owner, streak_days, last_study_date) values ($1, 1, $2::date)`,
      [owner, todayIso()],
    );
    return;
  }
  const last = rows[0].last_study_date;
  const today = todayIso();
  if (last === today) return;
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const y = yesterday.toISOString().slice(0, 10);
  const next = last === y ? rows[0].streak_days + 1 : 1;
  await sql(
    `update user_stats set streak_days = $2, last_study_date = $3::date, updated_at = now() where owner = $1`,
    [owner, next, today],
  );
}

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (owner instanceof Response) return owner;
  const rows = await sql<ProgressRow>(
    `select entry_id, ease_factor, interval_days, repetitions,
            next_review_at::text, last_reviewed_at::text, status, lapses,
            correct_count, wrong_count, note
     from user_progress where owner = $1`,
    [owner],
  );
  return Response.json(
    { progress: rows },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const owner = await ownerFromRequest(request);
  if (owner instanceof Response) return owner;
  const body = (await request.json()) as {
    entryId: string;
    grade: Grade;
    note?: string;
  };

  const existing = await sql<ProgressRow>(
    `select entry_id, ease_factor, interval_days, repetitions,
            next_review_at::text, last_reviewed_at::text, status, lapses,
            correct_count, wrong_count, note
     from user_progress where owner = $1 and entry_id = $2`,
    [owner, body.entryId],
  );

  const prev: SrsState = existing[0]
    ? {
        easeFactor: Number(existing[0].ease_factor),
        intervalDays: Number(existing[0].interval_days),
        repetitions: existing[0].repetitions,
        lapses: existing[0].lapses,
        status: existing[0].status,
      }
    : {
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        lapses: 0,
        status: "new",
      };

  const next = applySrs(prev, body.grade);
  const isCorrect = body.grade >= 3;
  const prevCorrect = existing[0]?.correct_count ?? 0;
  const prevWrong = existing[0]?.wrong_count ?? 0;
  const note = body.note ?? existing[0]?.note ?? "";

  await sql(
    `insert into user_progress (
       owner, entry_id, ease_factor, interval_days, repetitions, next_review_at,
       last_reviewed_at, status, lapses, correct_count, wrong_count, note, updated_at
     ) values ($1,$2,$3,$4,$5,$6::timestamptz, now(), $7,$8,$9,$10,$11, now())
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
      body.entryId,
      next.easeFactor,
      next.intervalDays,
      next.repetitions,
      next.nextReviewAt,
      next.status,
      next.lapses,
      prevCorrect + (isCorrect ? 1 : 0),
      prevWrong + (isCorrect ? 0 : 1),
      note,
    ],
  );

  await bumpStreak(owner);

  const rows = await sql<ProgressRow>(
    `select entry_id, ease_factor, interval_days, repetitions,
            next_review_at::text, last_reviewed_at::text, status, lapses,
            correct_count, wrong_count, note
     from user_progress where owner = $1 and entry_id = $2`,
    [owner, body.entryId],
  );

  return Response.json(
    { progress: rows[0] },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function PUT(request: Request) {
  const owner = await ownerFromRequest(request);
  if (owner instanceof Response) return owner;
  const body = (await request.json()) as { entryId: string; note: string };
  await sql(
    `insert into user_progress (owner, entry_id, note)
     values ($1,$2,$3)
     on conflict (owner, entry_id) do update set note = excluded.note, updated_at = now()`,
    [owner, body.entryId, body.note ?? ""],
  );
  return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}
