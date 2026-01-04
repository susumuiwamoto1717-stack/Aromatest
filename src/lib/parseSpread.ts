export type SpreadEntry = {
  id: string;
  statement: string;
  answer: string;
  answerTokens: string[];
  rawLeft: string;
  questionBody: string;
  explanation: string;
  chapter: string;
  source?: string;
};

const blockPattern =
  /###\s+([^\n]+)\n<<<SPREAD_START>>>\s*([\s\S]*?)<<<SPREAD_END>>>/g;

// 全角数字を半角に変換
function toHalfWidth(str: string): string {
  return str.replace(/[０-９]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0)
  );
}

function cleanMarkdown(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/`/g, "")
    .trim();
}

function extractStatement(left: string) {
  const boldMatch = left.match(/\*\*(.+?)\*\*/);
  if (boldMatch) {
    return boldMatch[1].replace(/答え：.*/, "").trim();
  }

  const firstLine = left
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ?? "";
}

function extractAnswer(left: string, right: string) {
  // マークダウンの**を削除してから検索
  const cleanLeft = left.replace(/\*\*/g, "");
  const cleanRight = right.replace(/\*\*/g, "");

  // 左ページから「答え：」形式を探す
  let match = cleanLeft.match(/答え[:：]\s*([0-9０-９〇○×✕❌⭕、,\s]+)/);
  if (match) {
    return toHalfWidth(match[1].trim());
  }

  // 右ページから「正解：」「正解は」「解答」形式を探す
  // 正解：4 or 正解 1、2、4 or 正解は 1, 3, 4
  match = cleanRight.match(/正解[:：は]?\s*([0-9０-９〇○×✕❌⭕、,\s]+)/);
  if (match) {
    return toHalfWidth(match[1].trim());
  }

  // 解答 1 or 解答：〇
  match = cleanRight.match(/解答[:：]?\s*([0-9０-９〇○×✕❌⭕、,\s]+)/);
  if (match) {
    return toHalfWidth(match[1].trim());
  }

  return "";
}

function stripAnswerLine(text: string) {
  return text
    .split("\n")
    .filter((line) => !line.includes("答え："))
    .join("\n")
    .trim();
}

export function parseSpreadMarkdown(markdown: string): SpreadEntry[] {
  const entries: SpreadEntry[] = [];
  const normalized = markdown.replace(/\r\n/g, "\n");
  const chapterMatches: { index: number; title: string }[] = [];
  const chapterRegex = /(^|\n)##\s+([^\n]+)/g;

  for (const match of normalized.matchAll(chapterRegex)) {
    const [, , title] = match;
    if (typeof match.index === "number") {
      chapterMatches.push({ index: match.index, title: title.trim() });
    }
  }

  for (const match of normalized.matchAll(blockPattern)) {
    const [, id, block] = match;
    const blockIndex = match.index ?? 0;
    const leftMatch = block.match(/\[LEFT\]\s*([\s\S]*?)\s*\[\/LEFT\]/);
    const rightMatch = block.match(/\[RIGHT\]\s*([\s\S]*?)\s*\[\/RIGHT\]/);
    const sourceMatch = block.match(/\[SOURCE\]([\s\S]*?)\[\/SOURCE\]/);

    const rawLeft = leftMatch ? cleanMarkdown(leftMatch[1]) : "";
    const rawRight = rightMatch ? rightMatch[1] : "";
    const explanation = rightMatch ? cleanMarkdown(rawRight) : "";
    const statement = extractStatement(leftMatch?.[1] ?? "");
    const answer = extractAnswer(leftMatch?.[1] ?? "", rawRight);
    const questionBody = stripAnswerLine(rawLeft);
    const chapter =
      [...chapterMatches]
        .filter((c) => c.index < blockIndex)
        .pop()?.title ?? "未分類";
    const answerTokens = toHalfWidth(answer)
      .split(/[,\s、]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    // Check for **問題 N** format (multiple questions in one block)
    // Use original left text (before cleanMarkdown) to detect pattern
    const originalLeft = leftMatch?.[1] ?? "";
    const multiQuestionPattern = /\*\*問題\s*(\d+)\*\*/g;
    const leftHasMultiQuestions = originalLeft.match(multiQuestionPattern);

    if (leftHasMultiQuestions && leftHasMultiQuestions.length > 1) {
      // Split LEFT by **問題 N** pattern
      // First part before **問題 1** is introduction, skip it
      const leftParts = originalLeft.split(/\*\*問題\s*\d+\*\*/).slice(1);
      const rightClean = cleanMarkdown(rawRight);

      leftHasMultiQuestions.forEach((_, idx) => {
        const qNum = idx + 1;
        const qLeftRaw = leftParts[idx] || "";
        const qLeft = cleanMarkdown(qLeftRaw);

        // Extract question text and options from LEFT
        const qLines = qLeft.split("\n").map(l => l.trim()).filter(Boolean);
        // First line is the question statement
        const qStatement = qLines[0] || "";
        // Remaining lines are options (numbered list)
        const qOptions = qLines.slice(1).join("\n");

        // Find answer in RIGHT section for this question
        const answerPattern = new RegExp(`問題\\s*${qNum}[\\s\\S]*?【解答】\\s*([0-9０-９〇○×✕❌⭕.．]+)`);
        const ansMatch = rightClean.match(answerPattern);
        const qAnswer = ansMatch ? toHalfWidth(ansMatch[1].replace(/[.．]/g, "").trim()) : "";
        const qTokens = toHalfWidth(qAnswer)
          .split(/[,\s、]+/)
          .map((t) => t.trim())
          .filter(Boolean);

        // Extract explanation
        const explPattern = new RegExp(`問題\\s*${qNum}[\\s\\S]*?【解説】([\\s\\S]*?)(?=問題\\s*\\d+|$)`);
        const explMatch = rightClean.match(explPattern);
        const qExplanation = explMatch ? explMatch[1].trim() : "";

        entries.push({
          id: `${id.trim()}-Q${qNum}`,
          statement: qStatement,
          answer: qAnswer,
          answerTokens: qTokens,
          rawLeft: qLeft,
          questionBody: qOptions || qStatement,
          explanation: qExplanation,
          chapter,
          source: sourceMatch ? cleanMarkdown(sourceMatch[1]) : undefined,
        });
      });
    }
    // some blocks include multiple Q/解説 in one RIGHT section (e.g., Q1...Q2...)
    else if (explanation.match(/^Q\d+/m)) {
      const sections = explanation
        .split(/^Q\d+/m)
        .map((s) => s.trim())
        .filter(Boolean);

      sections.forEach((sec, idx) => {
        // 複数の形式に対応
        let secAnswerMatch = sec.match(/解答[:：]?\s*([0-9０-９〇○×✕❌⭕、,\s]+)/);
        if (!secAnswerMatch) {
          secAnswerMatch = sec.match(/正解[:：は]?\s*([0-9０-９〇○×✕❌⭕、,\s]+)/);
        }
        const secAnswer = secAnswerMatch ? toHalfWidth(secAnswerMatch[1].trim()) : answer;
        const secTokens = toHalfWidth(secAnswer)
          .split(/[,\s、]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        const secQuestion =
          sec
            .split("\n")
            .find((line) => line.trim() && !line.includes("解答"))
            ?.trim() || statement;
        const secExplanation =
          sec.split(/解説[:：]/)[1]?.trim() || sec.trim();

        entries.push({
          id: `${id.trim()}-Q${idx + 1}`,
          statement: secQuestion,
          answer: secAnswer,
          answerTokens: secTokens,
          rawLeft,
          questionBody: secQuestion,
          explanation: secExplanation,
          chapter,
          source: sourceMatch ? cleanMarkdown(sourceMatch[1]) : undefined,
        });
      });
    } else {
      entries.push({
        id: id.trim(),
        statement,
        answer,
        answerTokens,
        rawLeft,
        questionBody,
        explanation,
        chapter,
        source: sourceMatch ? cleanMarkdown(sourceMatch[1]) : undefined,
      });
    }
  }

  return entries;
}
