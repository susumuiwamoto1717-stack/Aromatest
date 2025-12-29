"use client";

import { useEffect, useMemo, useState } from "react";
import { parseSpreadMarkdown, SpreadEntry } from "@/lib/parseSpread";

const accent =
  "bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-500 text-white";

export default function Home() {
  const [entries, setEntries] = useState<SpreadEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState<string>("すべて");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [choice, setChoice] = useState<string[]>([]);
  const [onlyIncorrect, setOnlyIncorrect] = useState(false);
  const [userKey, setUserKey] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const chapters = useMemo(() => {
    const uniq = Array.from(
      new Set(entries.map((e) => e.chapter || "未分類")),
    );
    return ["すべて", ...uniq];
  }, [entries]);

  const [history, setHistory] = useState<
    { id: string; isCorrect: boolean; selected: string[] }[]
  >([]);

  const incorrectIds = useMemo(
    () => history.filter((h) => !h.isCorrect).map((h) => h.id),
    [history],
  );

  const filteredEntries = useMemo(() => {
    let list =
      selectedChapter === "すべて"
        ? entries
        : entries.filter((e) => e.chapter === selectedChapter);
    if (onlyIncorrect) {
      list = list.filter((e) => incorrectIds.includes(e.id));
    }
    return list;
  }, [entries, incorrectIds, onlyIncorrect, selectedChapter]);

  const currentEntry = filteredEntries[currentIndex];

  const deriveQuestionType = (entry?: SpreadEntry) => {
    if (!entry) return "choice";
    const tokens = entry.answerTokens;
    const oxSet = new Set(["〇", "○", "✕", "×", "❌", "⭕"]);
    const allOx = tokens.length > 0 && tokens.every((t) => oxSet.has(t));
    if (allOx) return "ox";
    if (tokens.length > 1) return "multi";
    if (tokens.length === 1 && /^\d+$/.test(tokens[0])) return "choice";
    return "choice";
  };

  const questionType = useMemo(
    () => deriveQuestionType(currentEntry),
    [currentEntry],
  );

  const options = useMemo(() => {
    if (!currentEntry) return [] as { id: string; label: string }[];
    if (questionType === "ox")
      return [
        { id: "〇", label: "〇" },
        { id: "✕", label: "✕" },
      ];

    const lines = currentEntry.questionBody
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const numbered = lines
      .map((line) => {
        const match = line.match(/^(\d+)[\.\s、)]\s*(.+)$/);
        if (!match) return null;
        return { id: match[1], label: match[2].trim() };
      })
      .filter(Boolean) as { id: string; label: string }[];

    if (numbered.length > 0) return numbered;

    // fallback: numeric ids from answers
    if (
      currentEntry.answerTokens.length > 0 &&
      currentEntry.answerTokens.every((t) => /^\d+$/.test(t))
    ) {
      const max = Math.max(
        4,
        ...currentEntry.answerTokens.map((t) => parseInt(t, 10)),
      );
      return Array.from({ length: max }, (_, i) => {
        const id = String(i + 1);
        return { id, label: id };
      });
    }

    return [];
  }, [currentEntry, questionType]);

  // ユニーク化（稀に同じ文字が重複するケース対策）
  const uniqueOptions = useMemo(() => {
    const seen = new Set<string>();
    return options.filter((opt) => {
      if (seen.has(opt.id)) return false;
      seen.add(opt.id);
      return true;
    });
  }, [options]);
  const progress = useMemo(() => {
    if (!filteredEntries.length) return 0;
    return Math.round(((currentIndex + 1) / filteredEntries.length) * 100);
  }, [currentIndex, filteredEntries.length]);

  useEffect(() => {
    const loadDefault = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/spread_all.md");
        if (!res.ok) {
          throw new Error("spread_all.md を読み込めませんでした");
        }
        const text = await res.text();
        await loadFromText(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };

    loadDefault();
  }, []);

  const loadFromText = async (text: string) => {
    const parsed = parseSpreadMarkdown(text);
    if (!parsed.length) {
      throw new Error("抽出できる問題がありませんでした。フォーマットを確認してください。");
    }
    setEntries(parsed);
    setCurrentIndex(0);
    setShowAnswer(false);
    setChoice([]);
    setHistory([]);
  };

  const goPrevious = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
    setShowAnswer(false);
    setChoice([]);
  };

  const goNext = () => {
    setCurrentIndex((prev) =>
      Math.min(prev + 1, Math.max(filteredEntries.length - 1, 0)),
    );
    setShowAnswer(false);
    setChoice([]);
  };

  const shuffleEntries = () => {
    if (!filteredEntries.length) return;
    const source = [...filteredEntries];
    const shuffled = [...source];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const others = entries.filter((e) => !source.includes(e));
    setEntries([...shuffled, ...others]);
    setCurrentIndex(0);
    setShowAnswer(false);
    setChoice([]);
    setHistory([]);
  };

  const toggleSelect = (opt: string) => {
    setChoice((prev) => {
      let next: string[] = [];
      if (questionType === "ox" || questionType === "choice") {
        next = [opt];
      } else {
        next = prev.includes(opt)
          ? prev.filter((o) => o !== opt)
          : [...prev, opt];
      }
      if (currentEntry) {
        saveHistory(currentEntry, next);
      }
      setShowAnswer(true);
      return next;
    });
  };

  const evaluate = (entry: SpreadEntry, selected: string[]) => {
    const ansList = entry.answer
      .split(/[,\s]/)
      .map((a) => a.trim())
      .filter(Boolean);
    if (!ansList.length) return false;
    if (questionType === "ox" || questionType === "choice") {
      return selected.length === 1 && selected[0] === ansList[0];
    }
    const sortedSel = [...selected].sort();
    const sortedAns = [...ansList].sort();
    return (
      sortedSel.length === sortedAns.length &&
      sortedSel.every((v, i) => v === sortedAns[i])
    );
  };

  const saveHistory = (entry: SpreadEntry, selected: string[]) => {
    const isCorrect = evaluate(entry, selected);
    setHistory((prev) => {
      const others = prev.filter((h) => h.id !== entry.id);
      return [...others, { id: entry.id, isCorrect, selected }];
    });
    return isCorrect;
  };

  // ローカル保存（メール風のキーで localStorage に保存）
  const STORAGE_KEY = "aroma-trainer-progress";

  const loadProgress = () => {
    if (!userKey) {
      setSavedNotice("名前/メールを入力してください");
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setSavedNotice("保存データが見つかりません");
        return;
      }
      const all = JSON.parse(raw) as Record<string, unknown>;
      const data = all[userKey] as {
        currentId?: string;
        history?: { id: string; isCorrect: boolean; selected: string[] }[];
        selectedChapter?: string;
        onlyIncorrect?: boolean;
      };
      if (!data) {
        setSavedNotice("保存データが見つかりません");
        return;
      }
      if (data.history) setHistory(data.history);
      if (data.selectedChapter) setSelectedChapter(data.selectedChapter);
      if (typeof data.onlyIncorrect === "boolean")
        setOnlyIncorrect(data.onlyIncorrect);
      if (data.currentId && filteredEntries.length > 0) {
        const idx = filteredEntries.findIndex((e) => e.id === data.currentId);
        if (idx >= 0) setCurrentIndex(idx);
      } else {
        setCurrentIndex(0);
      }
      setShowAnswer(false);
      setChoice([]);
      setSavedNotice("保存データを読み込みました");
    } catch (e) {
      console.error(e);
      setSavedNotice("読み込みに失敗しました");
    }
  };

  const saveProgress = () => {
    if (!userKey) {
      setSavedNotice("名前/メールを入力してください");
      return;
    }
    const payload = {
      currentId: currentEntry?.id,
      history,
      selectedChapter,
      onlyIncorrect,
      savedAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[userKey] = payload;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      setSavedNotice("保存しました（この端末のみ）");
    } catch {
      setSavedNotice("保存に失敗しました");
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-3xl bg-white/90 p-6 shadow-xl shadow-indigo-100 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="yomogi text-xl text-indigo-600">Aroma Trainer</p>
              <h1 className="yomogi text-3xl font-bold text-indigo-700 sm:text-4xl">
                アロマインスト&セラ 共通対策
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-gray-600">
                章を選択
              </label>
              <select
                className="rounded-full border border-indigo-200 bg-white px-3 py-2 text-sm text-indigo-700 shadow-sm"
                value={selectedChapter}
                onChange={(e) => {
                  setSelectedChapter(e.target.value);
                  setCurrentIndex(0);
                  setShowAnswer(false);
                  setChoice([]);
                }}
              >
                {chapters.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                placeholder="名前/メール（保存キー）"
                className="w-56 rounded-full border border-indigo-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={saveProgress}
                className="rounded-full border border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                進捗を保存
              </button>
              <button
                type="button"
                onClick={loadProgress}
                className="rounded-full border border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                保存を読み込む
              </button>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            章ごとに問題を選び、左で問題、右で回答と解説を確認できます。スマホは「回答を見る」ボタンで開閉。
          </p>
          {savedNotice && (
            <p className="mt-2 text-xs text-emerald-700">{savedNotice}</p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">
              全 {filteredEntries.length || "-"} 問
            </div>
            <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">
              現在{" "}
              {filteredEntries.length ? currentIndex + 1 : "-"} /{" "}
              {filteredEntries.length || "-"}
            </div>
            <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">
              進捗 {progress}%
            </div>
          </div>
        </header>

        <section className="rounded-3xl bg-white/90 p-6 shadow-xl shadow-indigo-100 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={shuffleEntries}
                className="rounded-full border border-indigo-100 bg-white px-5 py-3 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                並び順をシャッフル
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                画面をリセット
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={onlyIncorrect}
                onChange={(e) => {
                  setOnlyIncorrect(e.target.checked);
                  setCurrentIndex(0);
                }}
                className="h-4 w-4 accent-indigo-600"
              />
              間違った問題だけを解き直す
            </label>
          </div>
          {/* upload status removed */}
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-2xl shadow-indigo-100">
          {loading && (
            <div className="flex min-h-[320px] items-center justify-center text-indigo-700">
              読み込み中です…
            </div>
          )}
          {!loading && error && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-rose-700">
              {error}
            </div>
          )}
          {!loading && !error && !currentEntry && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-gray-600">
              表示できる問題がありません。ファイルを確認してください。
            </div>
          )}
          {!loading && !error && currentEntry && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-indigo-100 px-4 py-2 text-xs font-bold text-indigo-700">
                      {currentEntry.id}
                    </span>
                    {currentEntry.source && (
                      <span className="rounded-full bg-gray-100 px-3 py-2 text-[11px] font-semibold text-gray-600">
                        {currentEntry.source}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-500">
                    {currentIndex + 1} / {filteredEntries.length}
                  </span>
                </div>

                <div className="w-full rounded-full bg-indigo-100">
                  <div
                    className="h-2 rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl bg-indigo-50/80 p-5 shadow-inner">
                    <p className="yomogi text-lg font-bold text-indigo-700">
                      問題
                    </p>
                    <p className="mt-2 text-lg font-semibold leading-relaxed text-gray-900">
                      {currentEntry.statement}
                    </p>
                    {currentEntry.questionBody !== currentEntry.statement && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                        {currentEntry.questionBody}
                      </p>
                    )}
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-gray-500">
                        回答を選択（左側で回答します）
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {uniqueOptions.map((opt) => {
                          const isSelected = choice.includes(opt.id);
                          const baseStyle =
                            "w-full rounded-xl border-2 px-4 py-3 text-base font-semibold shadow-sm transition text-left";
                          const selectedStyle = isSelected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                            : "border-indigo-100 bg-white text-indigo-700 hover:-translate-y-0.5 hover:shadow";
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              className={`${baseStyle} ${selectedStyle}`}
                              onClick={() => toggleSelect(opt.id)}
                            >
                              <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-200 bg-white text-sm font-bold">
                                {opt.id}
                              </span>
                              <span className="align-middle">{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-md">
                    <div className="flex items-center justify-between">
                      <p className="yomogi text-lg font-bold text-indigo-700">
                        解説
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAnswer((prev) => !prev)}
                        className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                      >
                        {showAnswer ? "隠す" : "回答を見る"}
                      </button>
                    </div>
                    {showAnswer ? (
                      <div className="mt-4 space-y-4">
                        {choice.length > 0 && (
                          <div
                            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${evaluate(currentEntry, choice) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
                          >
                            {evaluate(currentEntry, choice)
                              ? "正解です"
                              : `不正解です。正解は ${currentEntry.answerTokens.join(" / ") || currentEntry.answer}`}
                          </div>
                        )}
                        {choice.length === 0 && (
                          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-700">
                            左側で回答を選ぶとここに結果と解説が表示されます。
                          </div>
                        )}

                        <div className="inline-flex rounded-full bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">
                          正解: {currentEntry.answer || "？"}{" "}
                          {questionType === "multi" ? "(複数選択可)" : ""}
                        </div>
                        <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-800">
                          {currentEntry.explanation}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-6 text-center text-sm text-indigo-700">
                        「回答を見る」を押すと、答えと解説がここに表示されます。
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={goPrevious}
                    disabled={currentIndex === 0}
                    className={`rounded-full px-5 py-3 text-sm font-semibold shadow-md transition ${currentIndex === 0 ? "bg-gray-200 text-gray-500" : "bg-white text-indigo-700 hover:-translate-y-0.5 hover:shadow-lg border border-indigo-100"}`}
                  >
                    前へ
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={currentIndex === filteredEntries.length - 1}
                    className={`rounded-full px-6 py-3 text-sm font-semibold shadow-md transition ${currentIndex === filteredEntries.length - 1 ? "bg-gray-200 text-gray-500" : `${accent} hover:shadow-indigo-300 hover:-translate-y-0.5`}`}
                  >
                    次へ
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  左側が問題、右側が回答・解説。スマホは回答ボタンで開閉できます。
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
