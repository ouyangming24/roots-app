"use client";

import { useEffect, useMemo, useState } from "react";
import type { Grade, LexiconEntry, PracticeMode } from "@/lib/types";
import { shuffle, typeLabel } from "@/lib/lexicon";

type Props = {
  mode: PracticeMode;
  queue: LexiconEntry[];
  all: LexiconEntry[];
  soundEnabled: boolean;
  onGrade: (entryId: string, grade: Grade) => Promise<void>;
  onFinish: (result: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    totalItems: number;
    correctItems: number;
    entryIds: string[];
  }) => void;
  onCancel: () => void;
};

function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = ok ? 740 : 220;
    g.gain.value = 0.04;
    o.start();
    o.stop(ctx.currentTime + 0.08);
  } catch {
    /* ignore */
  }
}

export function PracticeSession({
  mode,
  queue,
  all,
  soundEnabled,
  onGrade,
  onFinish,
  onCancel,
}: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [startedAt] = useState(() => new Date().toISOString());
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  const current = queue[index];
  const done = index >= queue.length;

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Date.now() - new Date(startedAt).getTime());
    }, 250);
    return () => clearInterval(t);
  }, [startedAt]);

  const choices = useMemo(() => {
    if (!current) return [] as { id: string; label: string }[];
    if (mode === "choice" || mode === "reverse" || mode === "example-root") {
      const distractors = shuffle(all.filter((e) => e.id !== current.id)).slice(0, 3);
      const pool = shuffle([current, ...distractors]);
      if (mode === "choice") {
        return pool.map((e) => ({ id: e.id, label: e.meaning }));
      }
      if (mode === "reverse") {
        return pool.map((e) => ({ id: e.id, label: e.form }));
      }
      return pool.map((e) => ({ id: e.id, label: `${e.form} · ${e.meaning}` }));
    }
    return [];
  }, [all, current, mode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done || busy) return;
      if (mode === "flashcard") {
        if (e.code === "Space") {
          e.preventDefault();
          setFlipped((v) => !v);
        }
        if (flipped && (e.key === "ArrowLeft" || e.key === "1")) void grade(1);
        if (flipped && (e.key === "ArrowRight" || e.key === "3" || e.key === "5")) void grade(e.key === "5" ? 5 : 4);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, flipped, done, busy, index]);

  async function grade(g: Grade) {
    if (!current || busy) return;
    setBusy(true);
    const ok = g >= 3;
    if (soundEnabled) beep(ok);
    if (ok) setCorrectCount((c) => c + 1);
    setAnsweredIds((ids) => [...ids, current.id]);
    await onGrade(current.id, g);
    setFlipped(false);
    setAnswer("");
    setPicked(null);
    setIndex((i) => i + 1);
    setBusy(false);
  }

  function emitFinish(totalItems: number, entryIds: string[], corrects: number) {
    if (finished || entryIds.length === 0) {
      return;
    }
    setFinished(true);
    const endedAt = new Date().toISOString();
    onFinish({
      startedAt,
      endedAt,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      totalItems,
      correctItems: corrects,
      entryIds,
    });
  }

  useEffect(() => {
    if (!done || queue.length === 0) return;
    emitFinish(queue.length, queue.map((q) => q.id), correctCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  function handleCancel() {
    if (answeredIds.length > 0) {
      emitFinish(answeredIds.length, answeredIds, correctCount);
    }
    onCancel();
  }

  if (!current && !done) {
    return (
      <div className="panel" style={{ padding: "1.25rem" }}>
        <p>队列为空。</p>
        <button className="btn secondary" onClick={handleCancel}>
          返回
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="panel fade-in" style={{ padding: "1.5rem", textAlign: "center" }}>
        <h2 className="brand" style={{ marginTop: 0 }}>
          本轮完成
        </h2>
        <p className="muted">
          正确 {correctCount}/{queue.length} · 用时 {Math.round(elapsed / 1000)} 秒
        </p>
        <button className="btn" onClick={onCancel}>
          回到主页
        </button>
      </div>
    );
  }

  const example = current.examples[0];

  return (
    <div className="panel fade-in" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div className="muted" style={{ fontSize: "0.9rem" }}>
          {index + 1}/{queue.length} · {Math.floor(elapsed / 1000)}s
        </div>
        <button className="btn ghost" onClick={handleCancel}>
          结束
        </button>
      </div>
      <div className="progress-bar" style={{ margin: "0.8rem 0 1.1rem" }}>
        <span style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      {mode === "flashcard" && (
        <div>
          <div className="flip-card" onClick={() => setFlipped((v) => !v)} role="button" tabIndex={0}>
            <div className={`flip-inner ${flipped ? "flipped" : ""}`}>
              <div className="flip-face">
                <div className="chip">{typeLabel(current.type)}</div>
                <div className="brand" style={{ fontSize: "2.2rem" }}>
                  {current.form}
                </div>
                <div className="muted">点击或按空格翻转</div>
              </div>
              <div className="flip-face back">
                <div className="brand" style={{ fontSize: "1.5rem" }}>
                  {current.meaning}
                </div>
                <div className="muted">
                  {current.origin} · {current.mnemonic}
                </div>
                <div>
                  {current.examples.slice(0, 2).map((ex) => (
                    <span key={ex.word} className="chip" style={{ margin: 4 }}>
                      {ex.word}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {flipped && (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn danger" disabled={busy} onClick={() => void grade(1)}>
                忘记 <span className="kbd">←</span>
              </button>
              <button className="btn warn" disabled={busy} onClick={() => void grade(3)}>
                模糊
              </button>
              <button className="btn good" disabled={busy} onClick={() => void grade(5)}>
                记得 <span className="kbd">→</span>
              </button>
            </div>
          )}
        </div>
      )}

      {(mode === "choice" || mode === "reverse" || mode === "example-root") && (
        <div>
          <div style={{ marginBottom: 14 }}>
            {mode === "choice" && (
              <>
                <div className="chip">{typeLabel(current.type)}</div>
                <h2 className="brand" style={{ fontSize: "2rem", margin: "0.4rem 0" }}>
                  {current.form}
                </h2>
                <p className="muted">选择正确含义</p>
              </>
            )}
            {mode === "reverse" && (
              <>
                <p className="muted">根据含义选择词根/词缀</p>
                <h2 className="brand" style={{ fontSize: "1.6rem", margin: "0.4rem 0" }}>
                  {current.meaning}
                </h2>
              </>
            )}
            {mode === "example-root" && (
              <>
                <p className="muted">例词来自哪个词根/词缀？</p>
                <h2 className="brand" style={{ fontSize: "1.8rem", margin: "0.4rem 0" }}>
                  {example?.word}
                </h2>
                <p className="muted">{example?.gloss}</p>
              </>
            )}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {choices.map((c) => {
              const shown = picked !== null;
              const isRight = c.id === current.id;
              const cls =
                shown && isRight ? "choice correct" : shown && picked === c.id ? "choice wrong" : "choice";
              return (
                <button
                  key={c.id}
                  className={cls}
                  disabled={picked !== null || busy}
                  onClick={() => {
                    setPicked(c.id);
                    void grade(c.id === current.id ? 5 : 1);
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === "spelling" && (
        <div>
          <p className="muted">根据含义默写词根/词缀形式</p>
          <h2 className="brand" style={{ fontSize: "1.6rem" }}>
            {current.meaning}
          </h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            提示：{typeLabel(current.type)} · {current.origin} · 例词 {example?.word}
          </p>
          <input
            className="input"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="输入如 spect 或 -tion"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
                const ok = norm(answer) === norm(current.form) || norm(current.form).includes(norm(answer));
                void grade(ok && answer.trim() ? 5 : 1);
              }
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="btn"
              disabled={busy || !answer.trim()}
              onClick={() => {
                const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
                const ok = norm(answer) === norm(current.form) || (norm(answer).length > 2 && norm(current.form).includes(norm(answer)));
                void grade(ok ? 5 : 1);
              }}
            >
              提交
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => void grade(1)}>
              不会
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
