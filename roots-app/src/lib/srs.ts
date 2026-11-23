import type { Grade } from "./types";

/** 艾宾浩斯固定阶梯（分钟）：约 10min → 1d → 2d → 4d → 7d → 15d → 30d */
export const EBBINGHAUS_MINUTES = [10, 1440, 2880, 5760, 10080, 21600, 43200] as const;

export type SrsState = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  status: string;
};

/**
 * SM-2 × 艾宾浩斯混合算法：
 * - grade ≥ 3 视为记住：按 SM-2 更新 ease / repetitions，并把间隔钳制到
 *   艾宾浩斯阶梯附近（首次成功用 10 分钟，随后按阶梯推进）。
 * - grade < 3：记为 lapse，回退到阶梯第 0 档（约 10 分钟后再学）。
 */
export function applySrs(prev: SrsState, grade: Grade, now = new Date()) {
  let { easeFactor, intervalDays, repetitions, lapses, status } = prev;

  if (grade < 3) {
    lapses += 1;
    repetitions = 0;
    intervalDays = EBBINGHAUS_MINUTES[0] / (60 * 24);
    status = "learning";
  } else {
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
    if (repetitions === 0) {
      intervalDays = EBBINGHAUS_MINUTES[0] / (60 * 24);
    } else if (repetitions === 1) {
      intervalDays = EBBINGHAUS_MINUTES[1] / (60 * 24);
    } else {
      const raw = intervalDays * easeFactor;
      const ladderDays = EBBINGHAUS_MINUTES.map((m) => m / (60 * 24));
      const next = ladderDays.find((d) => d > intervalDays + 0.01) ?? ladderDays[ladderDays.length - 1];
      intervalDays = Math.max(raw, next * 0.85);
      if (intervalDays > ladderDays[ladderDays.length - 1]) {
        intervalDays = Math.min(intervalDays, ladderDays[ladderDays.length - 1] * easeFactor);
      }
    }
    repetitions += 1;
    status = repetitions >= 5 ? "mastered" : repetitions >= 2 ? "reviewing" : "learning";
  }

  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return {
    easeFactor: Number(easeFactor.toFixed(3)),
    intervalDays: Number(intervalDays.toFixed(5)),
    repetitions,
    lapses,
    status,
    nextReviewAt: nextReviewAt.toISOString(),
  };
}

export function masteryScore(p: {
  repetitions: number;
  correct_count: number;
  wrong_count: number;
  status: string;
}): number {
  const total = p.correct_count + p.wrong_count;
  const accuracy = total === 0 ? 0 : p.correct_count / total;
  const base =
    p.status === "mastered" ? 0.85 : p.status === "reviewing" ? 0.55 : p.status === "learning" ? 0.3 : 0.05;
  return Math.min(1, Number((base * 0.6 + accuracy * 0.4 + Math.min(p.repetitions, 8) * 0.03).toFixed(3)));
}
