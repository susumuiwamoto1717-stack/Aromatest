import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  // Verify secret token
  if (token !== process.env.TEACHER_SECRET_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("user_key, created_at")
      .order("created_at", { ascending: false });

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    // Get all answers with aggregation
    const { data: answers, error: answersError } = await supabase
      .from("answers")
      .select("user_key, question_id, is_correct, chapter, answered_at");

    if (answersError) {
      return NextResponse.json({ error: answersError.message }, { status: 500 });
    }

    // Get all study days
    const { data: studyDays, error: studyDaysError } = await supabase
      .from("study_days")
      .select("user_key, study_date");

    if (studyDaysError) {
      return NextResponse.json({ error: studyDaysError.message }, { status: 500 });
    }

    // Aggregate data per user
    const userStats = users?.map((user) => {
      const userAnswers = answers?.filter((a) => a.user_key === user.user_key) || [];
      const userStudyDays = studyDays?.filter((s) => s.user_key === user.user_key) || [];

      const correctCount = userAnswers.filter((a) => a.is_correct).length;
      const totalCount = userAnswers.length;
      const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

      // Get latest answer date
      const latestAnswer = userAnswers.length > 0
        ? userAnswers.reduce((latest, a) =>
            new Date(a.answered_at) > new Date(latest.answered_at) ? a : latest
          )
        : null;

      // Count by chapter with question details
      const chapterStats: Record<string, {
        correct: number;
        total: number;
        questions: { questionId: string; isCorrect: boolean }[];
      }> = {};
      userAnswers.forEach((a) => {
        const ch = a.chapter || "その他";
        if (!chapterStats[ch]) {
          chapterStats[ch] = { correct: 0, total: 0, questions: [] };
        }
        chapterStats[ch].total++;
        if (a.is_correct) chapterStats[ch].correct++;
        chapterStats[ch].questions.push({
          questionId: a.question_id,
          isCorrect: a.is_correct,
        });
      });

      // Sort questions by questionId within each chapter
      Object.values(chapterStats).forEach((ch) => {
        ch.questions.sort((a, b) => a.questionId.localeCompare(b.questionId));
      });

      // Count wrong answers per question
      const wrongAnswersByQuestion: Record<string, { count: number; chapter: string }> = {};
      userAnswers.forEach((a) => {
        if (!a.is_correct) {
          if (!wrongAnswersByQuestion[a.question_id]) {
            wrongAnswersByQuestion[a.question_id] = { count: 0, chapter: a.chapter || "その他" };
          }
          wrongAnswersByQuestion[a.question_id].count++;
        }
      });

      // Convert to sorted array (most wrong first)
      const wrongQuestions = Object.entries(wrongAnswersByQuestion)
        .map(([questionId, data]) => ({
          questionId,
          wrongCount: data.count,
          chapter: data.chapter,
        }))
        .sort((a, b) => b.wrongCount - a.wrongCount);

      return {
        userKey: user.user_key,
        createdAt: user.created_at,
        totalAnswers: totalCount,
        correctAnswers: correctCount,
        accuracy,
        studyDaysCount: userStudyDays.length,
        latestActivity: latestAnswer?.answered_at || user.created_at,
        chapterStats,
        wrongQuestions,
      };
    });

    return NextResponse.json({ users: userStats });
  } catch (e) {
    console.error("Teacher API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
