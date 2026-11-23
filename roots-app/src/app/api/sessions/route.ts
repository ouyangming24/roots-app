import { sql } from "@/lib/db";
import { ownerFromRequest } from "@/lib/auth";
import type { SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = await ownerFromRequest(request);
  if (owner instanceof Response) return owner;
  const rows = await sql<SessionRow>(
    `select id, mode, started_at::text, ended_at::text, duration_ms,
            total_items, correct_items, entry_ids
     from practice_sessions
     where owner = $1
     order by started_at desc
     limit 100`,
    [owner],
  );
  return Response.json(
    { sessions: rows },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const owner = await ownerFromRequest(request);
  if (owner instanceof Response) return owner;
  const body = (await request.json()) as {
    mode: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    totalItems: number;
    correctItems: number;
    entryIds: string[];
  };

  const rows = await sql<{ id: number }>(
    `insert into practice_sessions
       (owner, mode, started_at, ended_at, duration_ms, total_items, correct_items, entry_ids)
     values ($1,$2,$3::timestamptz,$4::timestamptz,$5,$6,$7,$8::jsonb)
     returning id`,
    [
      owner,
      body.mode,
      body.startedAt,
      body.endedAt,
      body.durationMs,
      body.totalItems,
      body.correctItems,
      JSON.stringify(body.entryIds ?? []),
    ],
  );

  await sql(
    `insert into user_stats (owner, total_study_ms) values ($1, $2)
     on conflict (owner) do update set
       total_study_ms = user_stats.total_study_ms + excluded.total_study_ms,
       updated_at = now()`,
    [owner, body.durationMs],
  );

  return Response.json(
    { id: rows[0]?.id },
    { headers: { "cache-control": "private, no-store" } },
  );
}
