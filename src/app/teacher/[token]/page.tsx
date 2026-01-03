"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type QuestionResult = {
  questionId: string;
  isCorrect: boolean;
};

type ChapterStats = Record<string, {
  correct: number;
  total: number;
  questions: QuestionResult[];
}>;

type WrongQuestion = {
  questionId: string;
  wrongCount: number;
  chapter: string;
};

type UserStat = {
  userKey: string;
  createdAt: string;
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
  studyDaysCount: number;
  latestActivity: string;
  chapterStats: ChapterStats;
  wrongQuestions: WrongQuestion[];
};

export default function TeacherDashboard() {
  const params = useParams();
  const token = params.token as string;

  const [users, setUsers] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/teacher?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (res.status === 401) {
            setError("アクセス権限がありません");
          } else {
            setError("データの取得に失敗しました");
          }
          return;
        }
        const data = await res.json();
        setUsers(data.users || []);
      } catch {
        setError("エラーが発生しました");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const formatDateShort = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  const selectedUserData = users.find((u) => u.userKey === selectedUser);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          先生用ダッシュボード
        </h1>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500">登録ユーザー数</div>
            <div className="text-3xl font-bold text-indigo-600">{users.length}</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500">総回答数</div>
            <div className="text-3xl font-bold text-purple-600">
              {users.reduce((sum, u) => sum + u.totalAnswers, 0)}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500">平均正答率</div>
            <div className="text-3xl font-bold text-green-600">
              {users.length > 0
                ? Math.round(users.reduce((sum, u) => sum + u.accuracy, 0) / users.length)
                : 0}%
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">名前</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">回答数</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">正答率</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">学習日数</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">最終活動</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">詳細</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.userKey} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{user.userKey}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-green-600">{user.correctAnswers}</span>
                    <span className="text-gray-400"> / </span>
                    <span className="text-gray-600">{user.totalAnswers}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                        user.accuracy >= 80
                          ? "bg-green-100 text-green-700"
                          : user.accuracy >= 60
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.accuracy}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{user.studyDaysCount}日</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-sm">
                    {formatDateShort(user.latestActivity)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setSelectedUser(selectedUser === user.userKey ? null : user.userKey)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm"
                    >
                      {selectedUser === user.userKey ? "閉じる" : "詳細"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* User Detail */}
        {selectedUserData && (
          <div className="mt-6 bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {selectedUserData.userKey} の詳細
            </h2>
            <div className="text-sm text-gray-500 mb-4">
              登録日: {formatDate(selectedUserData.createdAt)}
            </div>

            <h3 className="text-md font-medium text-gray-700 mb-2">
              章別成績 <span className="text-xs text-gray-400">（クリックで問題一覧を表示）</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(selectedUserData.chapterStats).map(([chapter, stats]) => {
                const chapterAccuracy = Math.round((stats.correct / stats.total) * 100);
                const isExpanded = expandedChapter === chapter;
                return (
                  <div key={chapter}>
                    <button
                      onClick={() => setExpandedChapter(isExpanded ? null : chapter)}
                      className={`w-full text-left rounded-lg p-3 transition ${
                        isExpanded ? "bg-indigo-100 ring-2 ring-indigo-400" : "bg-gray-50 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-700 truncate" title={chapter}>
                          {chapter}
                        </div>
                        <span className="text-xs text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm text-gray-500">
                          {stats.correct}/{stats.total}問
                        </span>
                        <span
                          className={`text-sm font-medium ${
                            chapterAccuracy >= 80
                              ? "text-green-600"
                              : chapterAccuracy >= 60
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {chapterAccuracy}%
                        </span>
                      </div>
                      <div className="mt-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            chapterAccuracy >= 80
                              ? "bg-green-500"
                              : chapterAccuracy >= 60
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${chapterAccuracy}%` }}
                        />
                      </div>
                    </button>
                    {/* Question list when expanded */}
                    {isExpanded && stats.questions && (
                      <div className="mt-2 bg-white border border-indigo-200 rounded-lg p-3">
                        <div className="text-xs font-medium text-gray-600 mb-2">問題一覧</div>
                        <div className="flex flex-wrap gap-1">
                          {stats.questions.map((q, idx) => {
                            const qMatch = q.questionId.match(/Q(\d+)/);
                            const qNum = qMatch ? parseInt(qMatch[1], 10) : idx + 1;
                            return (
                              <div
                                key={q.questionId}
                                title={q.questionId}
                                className={`w-8 h-8 flex items-center justify-center rounded text-xs font-bold ${
                                  q.isCorrect
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {q.isCorrect ? "○" : "×"}
                                <span className="text-[10px] ml-0.5">{qNum}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          <span className="inline-block w-4 h-4 bg-blue-100 rounded mr-1 align-middle" /> 正解
                          <span className="inline-block w-4 h-4 bg-red-100 rounded mx-1 ml-3 align-middle" /> 不正解
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {users.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            まだユーザーがいません
          </div>
        )}
      </div>
    </div>
  );
}
