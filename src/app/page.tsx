"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { parseSpreadMarkdown, SpreadEntry } from "@/lib/parseSpread";

const accent =
  "bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-500 text-white";

type Screen = "start" | "quiz" | "result";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("start");
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
  const [submittedChoice, setSubmittedChoice] = useState<string[]>([]);
  const [streak, setStreak] = useState(0); // 連続正解数
  const [wrongStreak, setWrongStreak] = useState(0); // 連続不正解数
  const [studyDates, setStudyDates] = useState<string[]>([]); // 学習した日付

  const chapters = useMemo(() => {
    const uniq = Array.from(
      new Set(entries.map((e) => e.chapter || "未分類")),
    );
    return ["すべて", ...uniq];
  }, [entries]);

  const [history, setHistory] = useState<
    { id: string; isCorrect: boolean; selected: string[]; answeredAt?: string }[]
  >([]);
  const [syncing, setSyncing] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const incorrectIds = useMemo(
    () => history.filter((h) => !h.isCorrect).map((h) => h.id),
    [history],
  );

  const correctCount = useMemo(
    () => history.filter((h) => h.isCorrect).length,
    [history],
  );

  const incorrectCount = useMemo(
    () => history.filter((h) => !h.isCorrect).length,
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

    const questionText = entry.statement + entry.questionBody;
    const isMultiSelect = /すべて選び|全て選び|すべて選んで|複数選/.test(questionText);

    if (tokens.length > 1 || isMultiSelect) return "multi";
    if (tokens.length === 1 && /^\d+$/.test(tokens[0])) return "choice";
    return "choice";
  };

  // 解説テキストをクリーンアップ（別の問題が混入している場合に除去）
  const cleanExplanation = (text: string) => {
    // "---" の後に新しい問題が始まるパターンを検出して除去
    let cleaned = text.split(/\n---\n/).filter((_, i) => i === 0).join("");
    // "[LEFT]" タグが含まれている場合、その前で切る
    if (cleaned.includes("[LEFT]")) {
      cleaned = cleaned.split("[LEFT]")[0];
    }
    // "Q." または "Q．" で始まる新しい問題を検出して除去
    cleaned = cleaned.replace(/\n\n(?:\*\*)?Q[.．][\s\S]*$/, "");
    // "--" の後に改行して "Q" で始まるパターンも除去
    cleaned = cleaned.replace(/\n--\n[\s\S]*$/, "");
    return cleaned.trim();
  };

  const questionType = useMemo(
    () => deriveQuestionType(currentEntry),
    [currentEntry],
  );

  const { options, contextLines } = useMemo(() => {
    if (!currentEntry)
      return { options: [] as { id: string; label: string }[], contextLines: [] as string[] };

    // 全角数字を半角に変換する関数
    const toHalfWidthNum = (s: string) =>
      s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

    const lines = currentEntry.questionBody
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    // 問題文を抽出（番号付き選択肢以外の行）
    const context = lines.filter((line) => {
      const normalized = toHalfWidthNum(line);
      return !/^\d+[\.\s、)．]/.test(normalized);
    });

    const filteredContext = context.filter(
      (line) => !currentEntry.statement.includes(line) && line !== "選択肢"
    );

    // ○×問題の場合
    if (questionType === "ox") {
      return {
        options: [
          { id: "〇", label: "〇" },
          { id: "✕", label: "✕" },
        ],
        contextLines: filteredContext,
      };
    }

    const numbered = lines
      .map((line) => {
        // 全角数字を半角に変換してからマッチ
        const normalized = toHalfWidthNum(line);
        const match = normalized.match(/^(\d+)[\.\s、)．]\s*(.+)$/);
        if (!match) return null;
        return { id: match[1], label: match[2].trim() };
      })
      .filter(Boolean) as { id: string; label: string }[];

    if (numbered.length > 0) return { options: numbered, contextLines: filteredContext };

    if (
      currentEntry.answerTokens.length > 0 &&
      currentEntry.answerTokens.every((t) => /^\d+$/.test(t))
    ) {
      const max = Math.max(
        4,
        ...currentEntry.answerTokens.map((t) => parseInt(t, 10)),
      );
      const optList = Array.from({ length: max }, (_, i) => {
        const id = String(i + 1);
        return { id, label: id };
      });
      return { options: optList, contextLines: filteredContext };
    }

    return { options: [], contextLines: filteredContext };
  }, [currentEntry, questionType]);

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

  const remainingCount = useMemo(() => {
    return filteredEntries.length - currentIndex - 1;
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
    setSubmittedChoice([]);
  };

  const goNext = () => {
    setCurrentIndex((prev) =>
      Math.min(prev + 1, Math.max(filteredEntries.length - 1, 0)),
    );
    setShowAnswer(false);
    setChoice([]);
    setSubmittedChoice([]);
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
      setSubmittedChoice([]);
      setShowAnswer(false);
      return next;
    });
  };

  const evaluate = useCallback((entry: SpreadEntry, selected: string[]) => {
    const ansList = entry.answerTokens.length > 0
      ? entry.answerTokens
      : entry.answer.split(/[,\s、]+/).map((a) => a.trim()).filter(Boolean);

    if (!ansList.length) return false;

    const normalizeOx = (s: string) => {
      if (["〇", "○", "⭕"].includes(s)) return "〇";
      if (["✕", "×", "❌"].includes(s)) return "✕";
      return s;
    };

    const normalizedSel = selected.map(normalizeOx);
    const normalizedAns = ansList.map(normalizeOx);

    const qType = deriveQuestionType(entry);
    if (qType === "ox" || qType === "choice") {
      return normalizedSel.length === 1 && normalizedSel[0] === normalizedAns[0];
    }

    const sortedSel = [...normalizedSel].sort();
    const sortedAns = [...normalizedAns].sort();
    return (
      sortedSel.length === sortedAns.length &&
      sortedSel.every((v, i) => v === sortedAns[i])
    );
  }, []);

  const STORAGE_KEY = "aroma-trainer-progress";

  // 今日の日付を取得（YYYY-MM-DD形式）
  const getTodayStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  };

  const saveProgressRemote = useCallback(
    async (overrideStudyDates?: string[]) => {
      if (!userKey) return;
      const answersPayload = history.map((h) => {
        const entry = entries.find((e) => e.id === h.id);
        return {
          questionId: h.id,
          selected: h.selected,
          isCorrect: h.isCorrect,
          answeredAt: h.answeredAt || new Date().toISOString(),
          chapter: entry?.chapter,
          source: entry?.source,
        };
      });

      const payload = {
        userKey,
        answers: answersPayload,
        studyDates: overrideStudyDates ?? studyDates,
      };

      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to save progress");
      }
      setSavedNotice("クラウドに保存しました");
    },
    [entries, history, studyDates, userKey],
  );

  // 自動保存（バックグラウンド）
  const autoSave = useCallback(async () => {
    if (!userKey) return;
    const todayStr = getTodayStr();
    const updatedStudyDates = studyDates.includes(todayStr)
      ? studyDates
      : [...studyDates, todayStr];
    setStudyDates(updatedStudyDates);

    const payload = {
      currentId: currentEntry?.id,
      history,
      selectedChapter,
      onlyIncorrect,
      studyDates: updatedStudyDates,
      savedAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[userKey] = payload;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // silent fail for local auto-save
    }

    try {
      setSyncing(true);
      setRemoteError(null);
      await saveProgressRemote(updatedStudyDates);
    } catch (e) {
      console.error(e);
      setRemoteError("クラウド保存に失敗しました");
    } finally {
      setSyncing(false);
    }
  }, [
    userKey,
    currentEntry?.id,
    history,
    selectedChapter,
    onlyIncorrect,
    studyDates,
    saveProgressRemote,
  ]);

  const handleSubmit = () => {
    if (!currentEntry || choice.length === 0) return;
    const isCorrect = evaluate(currentEntry, choice);
    const answeredAt = new Date().toISOString();
    setHistory((prev) => {
      const others = prev.filter((h) => h.id !== currentEntry.id);
      return [
        ...others,
        { id: currentEntry.id, isCorrect, selected: choice, answeredAt },
      ];
    });
    // 連続正解/不正解を更新
    if (isCorrect) {
      setStreak((prev) => prev + 1);
      setWrongStreak(0);
    } else {
      setStreak(0);
      setWrongStreak((prev) => prev + 1);
    }
    setSubmittedChoice(choice);
    setShowAnswer(true);
  };

  // 回答後に自動保存
  useEffect(() => {
    if (submittedChoice.length > 0 && userKey) {
      void autoSave();
    }
  }, [submittedChoice, userKey, autoSave]);

  const loadProgress = useCallback(async () => {
    if (!userKey) {
      setSavedNotice("名前/メールを入力してください");
      return false;
    }

    const loadLocal = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setSavedNotice("保存データが見つかりません");
          return false;
        }
        const all = JSON.parse(raw) as Record<string, unknown>;
        const data = all[userKey] as {
          currentId?: string;
          history?: {
            id: string;
            isCorrect: boolean;
            selected: string[];
            answeredAt?: string;
          }[];
          selectedChapter?: string;
          onlyIncorrect?: boolean;
          studyDates?: string[];
        };
        if (!data) {
          setSavedNotice("保存データが見つかりません");
          return false;
        }
        if (data.history) setHistory(data.history);
        if (data.selectedChapter) setSelectedChapter(data.selectedChapter);
        if (typeof data.onlyIncorrect === "boolean")
          setOnlyIncorrect(data.onlyIncorrect);
        if (data.studyDates) setStudyDates(data.studyDates);
        setSavedNotice("ローカル保存を読み込みました");
        return true;
      } catch (e) {
        console.error(e);
        setSavedNotice("読み込みに失敗しました");
        return false;
      }
    };

    try {
      setSavedNotice("クラウドから読み込み中...");
      setRemoteError(null);
      const res = await fetch(
        `/api/progress?userKey=${encodeURIComponent(userKey)}`,
      );
      if (res.ok) {
        const data = await res.json();
        const remoteHistory =
          (data.answers as {
            question_id: string;
            selected: string[];
            is_correct: boolean;
            answered_at?: string;
          }[]) ?? [];
        setHistory(
          remoteHistory.map((a) => ({
            id: a.question_id,
            selected: a.selected ?? [],
            isCorrect: !!a.is_correct,
            answeredAt: a.answered_at ?? undefined,
          })),
        );
        if (Array.isArray(data.studyDays)) setStudyDates(data.studyDays);
        setSavedNotice("クラウドから読み込みました");
        return true;
      }
      setRemoteError("クラウド読み込みに失敗しました");
    } catch (e) {
      console.error(e);
      setRemoteError("クラウド読み込みに失敗しました");
    }

    return loadLocal();
  }, [userKey]);

  // filteredEntriesが変わったらcurrentIndexを調整
  useEffect(() => {
    if (filteredEntries.length > 0) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && userKey) {
        try {
          const all = JSON.parse(raw);
          const data = all[userKey];
          if (data?.currentId) {
            const idx = filteredEntries.findIndex((e) => e.id === data.currentId);
            if (idx >= 0) setCurrentIndex(idx);
          }
        } catch {
          // ignore
        }
      }
    }
  }, [filteredEntries, userKey]);

  const handleStartQuiz = () => {
    if (userKey) {
      void loadProgress();
    }
    setScreen("quiz");
  };

  const handleEndQuiz = () => {
    if (userKey) {
      void autoSave();
    }
    setScreen("result");
  };

  const handleBackToStart = () => {
    if (userKey) {
      void autoSave();
    }
    setScreen("start");
    setSavedNotice(null);
  };

  const isCurrentCorrect = submittedChoice.length > 0 && currentEntry && evaluate(currentEntry, submittedChoice);

  // スタートページ
  if (screen === "start") {
    return (
      <div className="min-h-screen p-4 sm:p-8 flex items-center justify-center">
        <div className="w-full max-w-xl">
          <div className="rounded-3xl bg-white/95 p-8 shadow-2xl shadow-indigo-200 backdrop-blur">
            <div className="text-center mb-8">
              <p className="yomogi text-xl text-indigo-600">Aroma Trainer</p>
              <h1 className="yomogi text-3xl font-bold text-indigo-700 sm:text-4xl mt-2">
                アロマインスト&セラ 共通対策
              </h1>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  名前またはメールアドレス（進捗保存用）
                </label>
                <input
                  value={userKey}
                  onChange={(e) => setUserKey(e.target.value)}
                  placeholder="例: tanaka@example.com"
                  className="w-full rounded-xl border-2 border-indigo-200 px-4 py-3 text-base focus:border-indigo-500 focus:outline-none"
                />
                <p className="mt-2 text-xs text-gray-500">
                  入力すると進捗が自動保存され、次回続きから再開できます
                </p>
              </div>

              {savedNotice && (
                <p className="text-sm text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl">
                  {savedNotice}
                </p>
              )}
              {remoteError && (
                <p className="text-sm text-rose-700 bg-rose-50 px-4 py-2 rounded-xl">
                  {remoteError}
                </p>
              )}
              {syncing && (
                <p className="text-xs text-indigo-700">
                  クラウド保存中...
                </p>
              )}

              {/* 全体進捗 */}
              <div className="rounded-xl bg-gradient-to-r from-indigo-100 to-purple-100 p-4">
                <p className="text-sm font-semibold text-indigo-800 mb-2">全体の進捗</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-4 bg-white rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                      style={{ width: `${entries.length > 0 ? (history.length / entries.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-lg font-bold text-indigo-700">
                    {history.length} / {entries.length}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {entries.length > 0 ? Math.round((history.length / entries.length) * 100) : 0}% 完了
                </p>
              </div>

              {/* 前回の進捗 */}
              {history.length > 0 && (
                <div className="rounded-xl bg-indigo-50 p-4">
                  <p className="text-sm font-semibold text-indigo-800 mb-2">前回の進捗</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-2xl font-bold text-indigo-700">{history.length}</p>
                      <p className="text-xs text-gray-600">回答済み</p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-2xl font-bold text-blue-600">{correctCount}</p>
                      <p className="text-xs text-gray-600">正解</p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-2xl font-bold text-rose-600">{incorrectCount}</p>
                      <p className="text-xs text-gray-600">不正解</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 学習カレンダー */}
              {(() => {
                const today = new Date();
                const year = today.getFullYear();
                const month = today.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
                const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

                return (
                  <div className="rounded-xl bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-800 mb-3">
                      📅 {year}年 {monthNames[month]} の学習記録
                    </p>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs">
                      {dayNames.map((day) => (
                        <div key={day} className="font-semibold text-gray-500 py-1">
                          {day}
                        </div>
                      ))}
                      {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const hasStudied = studyDates.includes(dateStr);
                        const isToday = day === today.getDate();
                        return (
                          <div
                            key={day}
                            className={`py-1 rounded ${isToday ? "ring-2 ring-amber-400" : ""} ${hasStudied ? "bg-amber-200" : "bg-white"}`}
                          >
                            <span className="text-gray-700">{day}</span>
                            {hasStudied && <span className="block text-sm">✅</span>}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      今月 {studyDates.filter(d => d.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).length} 日学習
                    </p>
                  </div>
                );
              })()}

              <div className="flex flex-col gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleStartQuiz}
                  disabled={loading}
                  className={`w-full rounded-xl py-4 text-lg font-bold shadow-lg transition ${loading ? "bg-gray-300 text-gray-500" : `${accent} hover:shadow-indigo-300 hover:-translate-y-0.5`}`}
                >
                  {loading ? "読み込み中..." : "学習を開始する"}
                </button>

                {userKey && (
                  <button
                    type="button"
                    onClick={async () => {
                      const loaded = await loadProgress();
                      if (loaded) {
                        setScreen("quiz");
                      }
                    }}
                    className="w-full rounded-xl border-2 border-indigo-200 bg-white py-3 text-base font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                  >
                    保存データから再開
                  </button>
                )}
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-gray-500">
              全 {entries.length} 問
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 結果ページ
  if (screen === "result") {
    const accuracy = history.length > 0 ? Math.round((correctCount / history.length) * 100) : 0;
    return (
      <div className="min-h-screen p-4 sm:p-8 flex items-center justify-center">
        <div className="w-full max-w-xl">
          <div className="rounded-3xl bg-white/95 p-8 shadow-2xl shadow-indigo-200 backdrop-blur text-center">
            <h1 className="yomogi text-3xl font-bold text-indigo-700 mb-6">
              学習終了
            </h1>

            <div className="rounded-xl bg-indigo-50 p-6 mb-6">
              <p className="text-6xl font-bold text-indigo-700 mb-2">{accuracy}%</p>
              <p className="text-lg text-indigo-600">正解率</p>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-3xl font-bold text-gray-700">{history.length}</p>
                <p className="text-sm text-gray-600">回答数</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-3xl font-bold text-blue-600">{correctCount}</p>
                <p className="text-sm text-gray-600">正解</p>
              </div>
              <div className="rounded-xl bg-rose-50 p-4">
                <p className="text-3xl font-bold text-rose-600">{incorrectCount}</p>
                <p className="text-sm text-gray-600">不正解</p>
              </div>
            </div>

            {userKey && (
              <p className="text-sm text-emerald-700 mb-6">
                進捗は自動保存されました
              </p>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleBackToStart}
                className={`w-full rounded-xl py-4 text-lg font-bold shadow-lg transition ${accent} hover:shadow-indigo-300 hover:-translate-y-0.5`}
              >
                スタートに戻る
              </button>
              {incorrectCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setOnlyIncorrect(true);
                    setCurrentIndex(0);
                    setShowAnswer(false);
                    setChoice([]);
                    setSubmittedChoice([]);
                    setScreen("quiz");
                  }}
                  className="w-full rounded-xl border-2 border-rose-200 bg-white py-3 text-base font-semibold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                >
                  間違った問題だけ復習する
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // クイズページ
  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* ヘッダー */}
        <header className="rounded-3xl bg-white/90 p-4 shadow-xl shadow-indigo-100 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="yomogi text-xl font-bold text-indigo-700">
                アロマインスト&セラ 共通対策
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {/* 進捗表示 */}
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded-full bg-blue-100 px-3 py-1 font-bold text-blue-700">
                  正解 {correctCount}
                </span>
                <span className="rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-700">
                  不正解 {incorrectCount}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 font-bold text-gray-700">
                  残り {remainingCount}
                </span>
              </div>
              <button
                type="button"
                onClick={handleEndQuiz}
                className="rounded-full bg-rose-500 px-5 py-2 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                終了
              </button>
            </div>
          </div>
        </header>

        {/* コントロール */}
        <section className="rounded-2xl bg-white/90 p-4 shadow-lg shadow-indigo-100 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
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
              <button
                type="button"
                onClick={shuffleEntries}
                className="rounded-full border border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                シャッフル
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
              間違った問題のみ
            </label>
          </div>
        </section>

        {/* メインコンテンツ */}
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
              表示できる問題がありません。
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
                  <span className="text-sm font-bold text-indigo-700">
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
                  {/* 問題 */}
                  <div className="rounded-2xl bg-indigo-50/80 p-5 shadow-inner">
                    <p className="yomogi text-lg font-bold text-indigo-700">
                      問題
                    </p>
                    <p className="mt-2 text-lg font-semibold leading-relaxed text-gray-900">
                      {currentEntry.statement}
                    </p>
                    {contextLines.length > 0 && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                        {contextLines.join("\n")}
                      </p>
                    )}
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-gray-500">
                        {questionType === "multi"
                          ? "複数選択可：当てはまるものをすべて選んでください"
                          : "回答を選択"}
                      </p>
                      {questionType === "multi" && (
                        <p className="text-xs font-bold text-indigo-600">
                          選択中: {choice.length > 0 ? choice.join(", ") : "なし"}
                        </p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-1">
                        {uniqueOptions.map((opt) => {
                          const isSelected = choice.includes(opt.id);
                          const baseStyle =
                            "w-full rounded-xl border-2 px-4 py-3 text-base font-semibold shadow-sm transition text-left";
                          const selectedStyle = isSelected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                            : "border-indigo-100 bg-white text-indigo-700 hover:-translate-y-0.5 hover:shadow";
                          const showLabel = questionType !== "ox";
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
                              {showLabel && (
                                <span className="align-middle">{opt.label}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={handleSubmit}
                          disabled={choice.length === 0}
                          className={`rounded-full px-5 py-3 text-sm font-semibold shadow-md transition ${choice.length === 0 ? "bg-gray-200 text-gray-500" : `${accent} hover:shadow-indigo-300 hover:-translate-y-0.5`}`}
                        >
                          回答する
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 解説 */}
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
                        {submittedChoice.length > 0 && currentEntry && (
                          <div
                            className={`rounded-xl border px-4 py-3 text-base font-bold ${isCurrentCorrect ? "border-blue-200 bg-blue-50 text-blue-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
                          >
                            {isCurrentCorrect ? (
                              <div className="flex flex-col gap-2">
                                <span>正解です！</span>
                                {streak > 0 && (
                                  <span className="text-xl">
                                    {"✨".repeat(Math.min(streak, 10))}
                                    {streak > 1 && (
                                      <span className="ml-2 text-sm font-normal">
                                        {streak}連続正解！
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <span>
                                  不正解です。正解は {currentEntry.answerTokens.join(" / ") || currentEntry.answer}
                                </span>
                                {wrongStreak >= 2 && (
                                  <span className="text-xl">
                                    💪
                                    <span className="ml-2 text-sm font-normal">
                                      ドンマイ！次は正解できる！
                                    </span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {submittedChoice.length === 0 && (
                          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 text-base text-indigo-700">
                            左側で回答を選ぶとここに結果と解説が表示されます。
                          </div>
                        )}

                        <p className={`whitespace-pre-wrap text-lg leading-relaxed font-medium ${
                          submittedChoice.length > 0 && isCurrentCorrect
                            ? "text-blue-700"
                            : submittedChoice.length > 0
                              ? "text-rose-700"
                              : "text-gray-800"
                        }`}>
                          {cleanExplanation(currentEntry.explanation)}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-6 text-center text-base text-indigo-700">
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
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
