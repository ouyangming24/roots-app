import type { Lexicon, LexiconEntry } from "./types";

let cached: Lexicon | null = null;

export async function loadLexicon(): Promise<Lexicon> {
  if (cached) return cached;
  const res = await fetch("/data/roots.json", { cache: "force-cache" });
  cached = (await res.json()) as Lexicon;
  return cached;
}

export function typeLabel(type: LexiconEntry["type"]) {
  return type === "root" ? "词根" : type === "prefix" ? "前缀" : "后缀";
}

export function difficultyLabel(n: number) {
  return ["", "入门", "基础", "进阶", "挑战", "高阶"][n] ?? `难度${n}`;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}小时${m % 60}分`;
  }
  return m > 0 ? `${m}分${r}秒` : `${r}秒`;
}

export function modeLabel(mode: string) {
  const map: Record<string, string> = {
    flashcard: "闪卡",
    choice: "选择题",
    "example-root": "例词猜词根",
    spelling: "拼写默写",
    reverse: "反向选择",
    daily: "今日计划",
  };
  return map[mode] ?? mode;
}
