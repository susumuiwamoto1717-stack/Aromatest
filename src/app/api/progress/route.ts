import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST: Save user progress
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userKey, answers, studyDates } = body as {
      userKey: string;
      answers: {
        questionId: string;
        selected: string[];
        isCorrect: boolean;
        answeredAt: string;
        chapter?: string;
        source?: string;
      }[];
      studyDates: string[];
    };

    if (!userKey) {
      return NextResponse.json({ error: "userKey is required" }, { status: 400 });
    }

    // Upsert user
    const { error: userError } = await supabase
      .from("users")
      .upsert({ user_key: userKey }, { onConflict: "user_key" });

    if (userError) {
      console.error("User upsert error:", userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // Delete existing answers for this user, then insert new ones
    if (answers && answers.length > 0) {
      await supabase.from("answers").delete().eq("user_key", userKey);

      const answersData = answers.map((a) => ({
        user_key: userKey,
        question_id: a.questionId,
        selected: a.selected,
        is_correct: a.isCorrect,
        answered_at: a.answeredAt,
        chapter: a.chapter || null,
        source: a.source || null,
      }));

      const { error: answersError } = await supabase.from("answers").insert(answersData);

      if (answersError) {
        console.error("Answers insert error:", answersError);
        return NextResponse.json({ error: answersError.message }, { status: 500 });
      }
    }

    // Upsert study days
    if (studyDates && studyDates.length > 0) {
      for (const dateStr of studyDates) {
        await supabase
          .from("study_days")
          .upsert(
            { user_key: userKey, study_date: dateStr },
            { onConflict: "user_key,study_date" }
          );
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/progress error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: Load user progress
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userKey = searchParams.get("userKey");

    if (!userKey) {
      return NextResponse.json({ error: "userKey is required" }, { status: 400 });
    }

    // Check if user exists
    const { data: user } = await supabase
      .from("users")
      .select("user_key")
      .eq("user_key", userKey)
      .single();

    if (!user) {
      return NextResponse.json({ answers: [], studyDays: [] });
    }

    // Get answers
    const { data: answers, error: answersError } = await supabase
      .from("answers")
      .select("question_id, selected, is_correct, answered_at, chapter, source")
      .eq("user_key", userKey)
      .order("answered_at", { ascending: true });

    if (answersError) {
      console.error("Answers fetch error:", answersError);
      return NextResponse.json({ error: answersError.message }, { status: 500 });
    }

    // Get study days
    const { data: studyDaysData, error: studyDaysError } = await supabase
      .from("study_days")
      .select("study_date")
      .eq("user_key", userKey);

    if (studyDaysError) {
      console.error("Study days fetch error:", studyDaysError);
      return NextResponse.json({ error: studyDaysError.message }, { status: 500 });
    }

    const studyDays = studyDaysData?.map((d) => d.study_date) || [];

    return NextResponse.json({ answers: answers || [], studyDays });
  } catch (e) {
    console.error("GET /api/progress error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
