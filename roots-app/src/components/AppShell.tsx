"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Grade,
  Lexicon,
  LexiconEntry,
  PracticeMode,
  ProgressRow,
  SessionRow,
  StatsRow,
} from "@/lib/types";
import {
  difficultyLabel,
  formatDuration,
  loadLexicon,
  modeLabel,
  shuffle,
  typeLabel,
} from "@/lib/lexicon";
import { masteryScore } from "@/lib/srs";
import { PracticeSession } from "./PracticeSession";

type Tab = "home" | "library" | "practice" | "history" | "settings";

type Viewer = {
  name: string;
  email: string;
  simulated?: boolean;
};

const MODE_OPTIONS: { id: PracticeMode; title: string; desc: string }[] = [
  { id: "flashcard", title: "闪卡", desc: "含义 ↔ 词根，空格翻转" },
  { id: "choice", title: "选择题", desc: "看词根选含义" },
  { id: "example-root", title: "例词猜词根", desc: "从例词反推词素" },
  { id: "spelling", title: "拼写默写", desc: "根据含义写出形式" },
  { id: "reverse", title: "反向选择", desc: "给含义选词缀/词根" },
];

export function AppShell() {
  const [tab, setTab] = useState<Tab>("home");
  const [lexicon, setLexicon] = useState<Lexicon | null>(null);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "root" | "prefix" | "suffix">("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [selected, setSelected] = useState<LexiconEntry | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [activeMode, setActiveMode] = useState<PracticeMode | null>(null);
  const [queue, setQueue] = useState<LexiconEntry[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const progressMap = useMemo(() => {
    const m = new Map<string, ProgressRow>();
    for (const p of progress) m.set(p.entry_id, p);
    return m;
  }, [progress]);

  const refresh = useCallback(async () => {
    const [lex, me, prog, sess] = await Promise.all([
      loadLexicon(),
      fetch("/api/me").then((r) => r.json()),
      fetch("/api/progress").then((r) => r.json()),
      fetch("/api/sessions").then((r) => r.json()),
    ]);
    setLexicon(lex);
    setViewer(me.viewer);
    setStats(me.stats);
    setProgress(prog.progress ?? []);
    setSessions(sess.sessions ?? []);
    setShowOnboarding(!me.stats?.onboarding_done);
    document.documentElement.setAttribute("data-theme", me.stats?.theme === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    refresh()
      .catch((e: Error) => setError(e.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const now = Date.now();
  const due = useMemo(() => {
    if (!lexicon) return [] as LexiconEntry[];
    return lexicon.entries.filter((e) => {
      const p = progressMap.get(e.id);
      if (!p) return false;
      return new Date(p.next_review_at).getTime() <= now && p.status !== "new";
    });
  }, [lexicon, progressMap, now]);

  const newOnes = useMemo(() => {
    if (!lexicon) return [] as LexiconEntry[];
    return lexicon.entries.filter((e) => !progressMap.has(e.id));
  }, [lexicon, progressMap]);

  const weak = useMemo(() => {
    if (!lexicon) return [] as { entry: LexiconEntry; score: number }[];
    return lexicon.entries
      .map((entry) => {
        const p = progressMap.get(entry.id);
        if (!p) return null;
        const score = masteryScore({
          repetitions: p.repetitions,
          correct_count: p.correct_count,
          wrong_count: p.wrong_count,
          status: p.status,
        });
        return { entry, score };
      })
      .filter((x): x is { entry: LexiconEntry; score: number } => !!x && (x.score < 0.55 || (progressMap.get(x.entry.id)?.wrong_count ?? 0) > 0))
      .sort((a, b) => a.score - b.score)
      .slice(0, 8);
  }, [lexicon, progressMap]);

  const learnedCount = progress.filter((p) => p.status !== "new").length;
  const masteredCount = progress.filter((p) => p.status === "mastered").length;
  const dailyNew = Math.min(stats?.daily_new_target ?? 8, newOnes.length);
  const dailyReview = Math.min(stats?.daily_review_target ?? 20, due.length);

  const filtered = useMemo(() => {
    if (!lexicon) return [] as LexiconEntry[];
    const query = q.trim().toLowerCase();
    return lexicon.entries.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (originFilter !== "all" && e.origin !== originFilter) return false;
      if (!query) return true;
      const hay = [e.form, e.meaning, e.mnemonic, e.origin, ...e.themes, ...e.examples.map((x) => x.word)]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [lexicon, originFilter, q, typeFilter]);

  const origins = useMemo(() => {
    if (!lexicon) return [] as string[];
    return [...new Set(lexicon.entries.map((e) => e.origin))].sort();
  }, [lexicon]);

  function startQueue(mode: PracticeMode, items: LexiconEntry[]) {
    if (items.length === 0) return;
    setQueue(items);
    setActiveMode(mode);
    setTab("practice");
  }

  function startDaily() {
    const review = shuffle(due).slice(0, dailyReview);
    const news = shuffle(newOnes).slice(0, dailyNew);
    startQueue("flashcard", [...review, ...news]);
  }

  async function onGrade(entryId: string, grade: Grade) {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryId, grade }),
    });
    const data = await res.json();
    if (data.progress) {
      setProgress((prev) => {
        const others = prev.filter((p) => p.entry_id !== entryId);
        return [...others, data.progress];
      });
    }
  }

  async function onFinishSession(result: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    totalItems: number;
    correctItems: number;
    entryIds: string[];
  }) {
    if (!activeMode) return;
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: activeMode,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        durationMs: result.durationMs,
        totalItems: result.totalItems,
        correctItems: result.correctItems,
        entryIds: result.entryIds,
      }),
    });
    await refresh();
  }

  async function saveNote() {
    if (!selected) return;
    await fetch("/api/progress", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryId: selected.id, note: noteDraft }),
    });
    setProgress((prev) => {
      const existing = prev.find((p) => p.entry_id === selected.id);
      if (existing) {
        return prev.map((p) => (p.entry_id === selected.id ? { ...p, note: noteDraft } : p));
      }
      return [
        ...prev,
        {
          entry_id: selected.id,
          ease_factor: 2.5,
          interval_days: 0,
          repetitions: 0,
          next_review_at: new Date().toISOString(),
          last_reviewed_at: null,
          status: "new",
          lapses: 0,
          correct_count: 0,
          wrong_count: 0,
          note: noteDraft,
        },
      ];
    });
  }

  async function patchStats(partial: Partial<StatsRow>) {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partial),
    });
    const data = await res.json();
    setStats(data.stats);
    if (partial.theme) {
      document.documentElement.setAttribute("data-theme", partial.theme === "dark" ? "dark" : "light");
    }
  }

  async function exportData() {
    const res = await fetch("/api/export");
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `english-roots-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    const text = await file.text();
    const data = JSON.parse(text) as { progress?: ProgressRow[]; stats?: StatsRow | null };
    await fetch("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    await refresh();
  }

  if (loading) {
    return (
      <div className="app-shell">
        <p className="muted">正在加载词库与进度…</p>
      </div>
    );
  }

  if (error || !lexicon || !stats) {
    return (
      <div className="app-shell">
        <p>加载失败：{error || "未知错误"}</p>
        <button className="btn" onClick={() => location.reload()}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="fade-in" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="brand" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", lineHeight: 1.05 }}>
              RootPath
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              英语词根词缀 · 间隔重复学习
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600 }}>{viewer?.name || "学习者"}</div>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              连续 {stats.streak_days} 天
              {viewer?.simulated ? " · 本地模拟身份" : ""}
            </div>
          </div>
        </div>
        <nav className="grid-nav" style={{ marginTop: 16 }}>
          {(
            [
              ["home", "今日"],
              ["library", "词库"],
              ["practice", "练习"],
              ["history", "历史"],
              ["settings", "设置"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`nav-item ${tab === id ? "active" : ""}`}
              onClick={() => {
                setActiveMode(null);
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {activeMode && queue.length > 0 ? (
        <PracticeSession
          mode={activeMode}
          queue={queue}
          all={lexicon.entries}
          soundEnabled={stats.sound_enabled}
          onGrade={onGrade}
          onFinish={(r) => void onFinishSession(r)}
          onCancel={() => {
            setActiveMode(null);
            setQueue([]);
            setTab("home");
            void refresh();
          }}
        />
      ) : (
        <>
          {tab === "home" && (
            <section className="fade-in" style={{ display: "grid", gap: 14 }}>
              <div className="panel" style={{ padding: "1.2rem" }}>
                <h2 className="brand" style={{ margin: "0 0 0.4rem", fontSize: "1.5rem" }}>
                  今日计划
                </h2>
                <p className="muted" style={{ marginTop: 0 }}>
                  建议新学 {dailyNew} · 复习 {dailyReview} · 词库共 {lexicon.entries.length} 条
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                  <Stat label="已学" value={String(learnedCount)} />
                  <Stat label="待复习" value={String(due.length)} />
                  <Stat label="掌握" value={String(masteredCount)} />
                </div>
                <button className="btn pulse-once" style={{ marginTop: 14, width: "100%" }} onClick={startDaily}>
                  一键开始今日任务
                </button>
              </div>

              <div className="panel" style={{ padding: "1.2rem" }}>
                <h3 style={{ marginTop: 0 }}>薄弱词根</h3>
                {weak.length === 0 ? (
                  <p className="muted">先学几轮后，这里会列出正确率偏低的条目。</p>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {weak.map(({ entry, score }) => (
                      <button
                        key={entry.id}
                        className="choice"
                        onClick={() => {
                          setSelected(entry);
                          setNoteDraft(progressMap.get(entry.id)?.note || "");
                          setTab("library");
                        }}
                      >
                        <strong>{entry.form}</strong>
                        <span className="muted"> · {entry.meaning} · 掌握度 {(score * 100).toFixed(0)}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === "library" && (
            <section className="fade-in" style={{ display: "grid", gap: 12 }}>
              <div className="panel" style={{ padding: "1rem", display: "grid", gap: 8 }}>
                <input
                  className="input"
                  placeholder="搜索词根、含义、例词、主题…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["all", "root", "prefix", "suffix"] as const).map((t) => (
                    <button
                      key={t}
                      className={`chip ${typeFilter === t ? "active" : ""}`}
                      style={
                        typeFilter === t
                          ? { borderColor: "var(--accent)", color: "var(--ink)" }
                          : undefined
                      }
                      onClick={() => setTypeFilter(t)}
                    >
                      {t === "all" ? "全部" : typeLabel(t)}
                    </button>
                  ))}
                  <select
                    className="input"
                    style={{ width: "auto", padding: "0.35rem 0.6rem" }}
                    value={originFilter}
                    onChange={(e) => setOriginFilter(e.target.value)}
                  >
                    <option value="all">全部语源</option>
                    {origins.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  显示 {filtered.length} 条
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {filtered.map((e) => {
                  const p = progressMap.get(e.id);
                  return (
                    <button
                      key={e.id}
                      className="panel"
                      style={{
                        padding: "0.9rem 1rem",
                        textAlign: "left",
                        cursor: "pointer",
                        border: selected?.id === e.id ? "1px solid var(--accent)" : undefined,
                      }}
                      onClick={() => {
                        setSelected(e);
                        setNoteDraft(p?.note || "");
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong className="brand" style={{ fontSize: "1.15rem" }}>
                          {e.form}
                        </strong>
                        <span className="chip">
                          {typeLabel(e.type)} · {difficultyLabel(e.difficulty)}
                        </span>
                      </div>
                      <div style={{ marginTop: 4 }}>{e.meaning}</div>
                      <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                        {e.origin} · {e.examples.map((x) => x.word).slice(0, 3).join(", ")}
                        {p ? ` · ${p.status}` : " · 未学"}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selected && (
                <div className="panel" style={{ padding: "1.1rem" }}>
                  <h3 className="brand" style={{ marginTop: 0, fontSize: "1.5rem" }}>
                    {selected.form}
                  </h3>
                  <p style={{ marginTop: 0 }}>{selected.meaning}</p>
                  <p className="muted">
                    语源 {selected.origin}
                    {selected.originDetail ? `（${selected.originDetail}）` : ""} · 记忆提示：
                    {selected.mnemonic}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {selected.themes.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                  <h4 style={{ marginBottom: 6 }}>例词</h4>
                  <ul style={{ marginTop: 0 }}>
                    {selected.examples.map((ex) => (
                      <li key={ex.word}>
                        <strong>{ex.word}</strong> — {ex.gloss}
                      </li>
                    ))}
                  </ul>
                  {selected.relatedIds.length > 0 && (
                    <>
                      <h4 style={{ marginBottom: 6 }}>同根/相关</h4>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {selected.relatedIds.map((id) => {
                          const rel = lexicon.entries.find((x) => x.id === id);
                          if (!rel) return null;
                          return (
                            <button
                              key={id}
                              className="chip"
                              onClick={() => {
                                setSelected(rel);
                                setNoteDraft(progressMap.get(rel.id)?.note || "");
                              }}
                            >
                              {rel.form}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <h4>我的助记笔记</h4>
                  <textarea
                    className="input"
                    rows={3}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="写下你自己的联想…"
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn secondary" onClick={() => void saveNote()}>
                      保存笔记
                    </button>
                    <button
                      className="btn"
                      onClick={() => startQueue("flashcard", [selected])}
                    >
                      练习这条
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === "practice" && (
            <section className="fade-in" style={{ display: "grid", gap: 10 }}>
              <div className="panel" style={{ padding: "1.1rem" }}>
                <h2 className="brand" style={{ marginTop: 0 }}>
                  练习模式
                </h2>
                <p className="muted">闪卡支持 <span className="kbd">Space</span> 翻转，<span className="kbd">←</span>/<span className="kbd">→</span> 评判。</p>
              </div>
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  className="panel"
                  style={{ padding: "1rem", textAlign: "left", cursor: "pointer" }}
                  onClick={() => {
                    const pool =
                      due.length > 0 ? shuffle([...due, ...newOnes.slice(0, 5)]).slice(0, 12) : shuffle(lexicon.entries).slice(0, 10);
                    startQueue(m.id, pool);
                  }}
                >
                  <strong style={{ fontSize: "1.1rem" }}>{m.title}</strong>
                  <div className="muted">{m.desc}</div>
                </button>
              ))}
            </section>
          )}

          {tab === "history" && (
            <section className="fade-in" style={{ display: "grid", gap: 10 }}>
              <div className="panel" style={{ padding: "1.1rem" }}>
                <h2 className="brand" style={{ marginTop: 0 }}>
                  练习历史
                </h2>
                <p className="muted" style={{ marginTop: 0 }}>
                  累计学习时长 {formatDuration(stats.total_study_ms)}
                </p>
              </div>
              {sessions.length === 0 ? (
                <div className="panel" style={{ padding: "1rem" }}>
                  <p className="muted">还没有练习记录。完成一轮后会出现在这里。</p>
                </div>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="panel" style={{ padding: "0.9rem 1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{modeLabel(s.mode)}</strong>
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        {new Date(s.started_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                      </span>
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      时长 {formatDuration(s.duration_ms)} · 正确 {s.correct_items}/{s.total_items} · 正确率{" "}
                      {s.total_items ? Math.round((s.correct_items / s.total_items) * 100) : 0}%
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          {tab === "settings" && (
            <section className="fade-in" style={{ display: "grid", gap: 12 }}>
              <div className="panel" style={{ padding: "1.1rem", display: "grid", gap: 12 }}>
                <h2 className="brand" style={{ marginTop: 0 }}>
                  学习设置
                </h2>
                <label>
                  每日新学目标
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={30}
                    value={stats.daily_new_target}
                    onChange={(e) => void patchStats({ daily_new_target: Number(e.target.value) })}
                  />
                </label>
                <label>
                  每日复习目标
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={80}
                    value={stats.daily_review_target}
                    onChange={(e) => void patchStats({ daily_review_target: Number(e.target.value) })}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn secondary"
                    onClick={() => void patchStats({ theme: stats.theme === "dark" ? "light" : "dark" })}
                  >
                    切换{stats.theme === "dark" ? "亮色" : "暗色"}主题
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => void patchStats({ sound_enabled: !stats.sound_enabled })}
                  >
                    {stats.sound_enabled ? "关闭音效" : "开启音效"}
                  </button>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  SRS：SM-2 × 艾宾浩斯阶梯（约 10 分钟 → 1/2/4/7/15/30 天）。答错回到早期间隔。
                </p>
              </div>
              <div className="panel" style={{ padding: "1.1rem", display: "grid", gap: 10 }}>
                <h3 style={{ margin: 0 }}>导入 / 导出进度</h3>
                <button className="btn secondary" onClick={() => void exportData()}>
                  导出 JSON
                </button>
                <label className="btn secondary" style={{ textAlign: "center" }}>
                  导入 JSON
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importData(f);
                    }}
                  />
                </label>
              </div>
            </section>
          )}
        </>
      )}

      {showOnboarding && (
        <div className="overlay">
          <div className="panel modal fade-in">
            <h2 className="brand" style={{ marginTop: 0 }}>
              欢迎使用 RootPath
            </h2>
            <ol style={{ paddingLeft: "1.1rem", lineHeight: 1.7 }}>
              <li>先看「今日计划」，一键完成新学 + 复习。</li>
              <li>词库可按语源、类型筛选，并给条目写助记笔记。</li>
              <li>练习支持闪卡、选择、例词反推、拼写与反向模式。</li>
              <li>进度按登录用户隔离，并可用 JSON 导入导出。</li>
            </ol>
            <button
              className="btn"
              style={{ width: "100%" }}
              onClick={() => {
                setShowOnboarding(false);
                void patchStats({ onboarding_done: true });
              }}
            >
              开始学习
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "0.75rem",
        textAlign: "center",
      }}
    >
      <div className="brand" style={{ fontSize: "1.4rem" }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: "0.82rem" }}>
        {label}
      </div>
    </div>
  );
}
