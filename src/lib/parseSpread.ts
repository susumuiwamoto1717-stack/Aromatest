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

function extractAnswer(left: string) {
  const match = left.match(/答え[:：]\s*([0-9〇○×✕❌⭕、,\s]+)/);
  return match ? match[1].trim() : "";
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
    const explanation = rightMatch ? cleanMarkdown(rightMatch[1]) : "";
    const statement = extractStatement(leftMatch?.[1] ?? "");
    const answer = extractAnswer(leftMatch?.[1] ?? "");
    const questionBody = stripAnswerLine(rawLeft);
    const chapter =
      [...chapterMatches]
        .filter((c) => c.index < blockIndex)
        .pop()?.title ?? "未分類";
    const answerTokens = answer
      .split(/[,\s、]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    // some blocks include multiple Q/解説 in one RIGHT section (e.g., Q1...Q2...)
    const sections = explanation.match(/^Q\d+/m)
      ? explanation
          .split(/^Q\d+/m)
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    if (sections && sections.length > 0) {
      sections.forEach((sec, idx) => {
        const secAnswerMatch = sec.match(/解答[:：]\s*([0-9〇○×✕❌⭕、,\s]+)/);
        const secAnswer = secAnswerMatch ? secAnswerMatch[1].trim() : answer;
        const secTokens = secAnswer
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
