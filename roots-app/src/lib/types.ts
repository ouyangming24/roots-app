export type EntryType = "root" | "prefix" | "suffix";

export type Example = {
  word: string;
  gloss: string;
};

export type LexiconEntry = {
  id: string;
  form: string;
  type: EntryType;
  meaning: string;
  origin: string;
  originDetail: string;
  difficulty: number;
  themes: string[];
  examples: Example[];
  mnemonic: string;
  relatedIds: string[];
  tags: string[];
};

export type Lexicon = {
  version: number;
  title: string;
  locale: string;
  srsDefaults: {
    algorithm: string;
    intervalsMinutes: number[];
    description: string;
  };
  entries: LexiconEntry[];
};

export type ProgressRow = {
  entry_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  status: string;
  lapses: number;
  correct_count: number;
  wrong_count: number;
  note: string;
};

export type SessionRow = {
  id: number;
  mode: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  total_items: number;
  correct_items: number;
  entry_ids: string[];
};

export type StatsRow = {
  streak_days: number;
  last_study_date: string | null;
  total_study_ms: number;
  daily_new_target: number;
  daily_review_target: number;
  theme: string;
  sound_enabled: boolean;
  onboarding_done: boolean;
};

export type PracticeMode =
  | "flashcard"
  | "choice"
  | "example-root"
  | "spelling"
  | "reverse";

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;
