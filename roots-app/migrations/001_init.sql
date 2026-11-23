create table if not exists user_progress (
  owner text not null,
  entry_id text not null,
  ease_factor double precision not null default 2.5,
  interval_days double precision not null default 0,
  repetitions integer not null default 0,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  status text not null default 'new',
  lapses integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner, entry_id)
);

create index if not exists user_progress_owner_next_idx
  on user_progress (owner, next_review_at);

create table if not exists practice_sessions (
  id bigserial primary key,
  owner text not null,
  mode text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_ms integer not null,
  total_items integer not null,
  correct_items integer not null,
  entry_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists practice_sessions_owner_started_idx
  on practice_sessions (owner, started_at desc);

create table if not exists user_stats (
  owner text primary key,
  streak_days integer not null default 0,
  last_study_date date,
  total_study_ms bigint not null default 0,
  daily_new_target integer not null default 8,
  daily_review_target integer not null default 20,
  theme text not null default 'light',
  sound_enabled boolean not null default true,
  onboarding_done boolean not null default false,
  updated_at timestamptz not null default now()
);
