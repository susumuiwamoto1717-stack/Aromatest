export type SpreadEntry = {
  id: string;
  statement: string;
  answer: string;
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
  const match = left.match(/答え：\s*([0-9〇○×✕❌⭕、,\s]+)/);
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

    entries.push({
      id: id.trim(),
      statement,
      answer,
      rawLeft,
      questionBody,
      explanation,
      chapter,
      source: sourceMatch ? cleanMarkdown(sourceMatch[1]) : undefined,
    });
  }

  return entries;
}
