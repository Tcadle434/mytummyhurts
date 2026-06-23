// Structure-aware chunking: split by markdown headings into sections, then
// token-window large sections with overlap. Parent (section) chunks are stored
// but not embedded; their child windows are embedded.
export interface RawChunk {
  chunkIndex: number;
  headingPath: string[];
  content: string;
  tokenCount: number;
  isParent: boolean;
  parentIndex: number | null;
}

const TARGET_TOKENS = 512;
const OVERLAP_TOKENS = 64;

// Cheap token estimate (~4 chars/token) — good enough for chunk sizing without
// pulling a tokenizer dependency. Real billing tokens come from the API usage.
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function splitIntoSections(markdown: string): Array<{ headingPath: string[]; body: string }> {
  const lines = markdown.split('\n');
  const sections: Array<{ headingPath: string[]; body: string }> = [];
  const stack: Array<{ level: number; title: string }> = [];
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) sections.push({ headingPath: stack.map((s) => s.title), body });
    buffer = [];
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, title: m[2].trim() });
    } else {
      buffer.push(line);
    }
  }
  flush();
  if (sections.length === 0 && markdown.trim()) {
    sections.push({ headingPath: [], body: markdown.trim() });
  }
  return sections;
}

function windowSection(body: string): string[] {
  if (estimateTokens(body) <= TARGET_TOKENS) return [body];
  const sentences = body.split(/(?<=[.!?])\s+/);
  const windows: string[] = [];
  let current: string[] = [];
  let tokens = 0;
  for (const sentence of sentences) {
    const t = estimateTokens(sentence);
    if (tokens + t > TARGET_TOKENS && current.length) {
      windows.push(current.join(' '));
      // overlap: keep trailing sentences up to ~OVERLAP_TOKENS
      const overlap: string[] = [];
      let ot = 0;
      for (let i = current.length - 1; i >= 0 && ot < OVERLAP_TOKENS; i--) {
        overlap.unshift(current[i]);
        ot += estimateTokens(current[i]);
      }
      current = [...overlap];
      tokens = ot;
    }
    current.push(sentence);
    tokens += t;
  }
  if (current.length) windows.push(current.join(' '));
  return windows;
}

export function chunkDocument(markdown: string): RawChunk[] {
  const sections = splitIntoSections(markdown);
  const chunks: RawChunk[] = [];
  let index = 0;
  for (const section of sections) {
    const parentIndex = index;
    chunks.push({
      chunkIndex: index++,
      headingPath: section.headingPath,
      content: section.body,
      tokenCount: estimateTokens(section.body),
      isParent: true,
      parentIndex: null,
    });
    for (const window of windowSection(section.body)) {
      chunks.push({
        chunkIndex: index++,
        headingPath: section.headingPath,
        content: window,
        tokenCount: estimateTokens(window),
        isParent: false,
        parentIndex,
      });
    }
  }
  return chunks;
}
