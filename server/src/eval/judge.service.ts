import { Injectable } from '@nestjs/common';

export interface JudgeResult {
  pass: boolean;
  score: number;
  explanation: string;
  prompt: string;
  raw: unknown;
}

/**
 * LLM-as-judge for generation evals (groundedness, no-invented-ingredients,
 * safety / no over-diagnosis). Uses a chat-completions judge model (default
 * gpt-4.1-mini). No API key -> a neutral skip so offline eval runs still record.
 */
@Injectable()
export class JudgeService {
  async judge(params: { dimension: string; instruction: string; content: string }): Promise<JudgeResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    const prompt = [
      `You are a strict evaluator for the "${params.dimension}" dimension of a gut-health AI.`,
      params.instruction,
      'Respond ONLY with JSON: {"pass": boolean, "score": number 0..1, "explanation": string}.',
      '',
      'CONTENT TO EVALUATE:',
      params.content,
    ].join('\n');

    if (!apiKey) {
      return { pass: true, score: 1, explanation: 'judge skipped (no OPENAI_API_KEY)', prompt, raw: null };
    }

    const model = process.env.OPENAI_JUDGE_MODEL ?? 'gpt-4.1-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      return { pass: false, score: 0, explanation: `judge_http_${res.status}`, prompt, raw: null };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? '{}';
    let parsed: { pass?: boolean; score?: number; explanation?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { pass: false, score: 0, explanation: 'unparseable judge response' };
    }
    return {
      pass: Boolean(parsed.pass),
      score: Number(parsed.score ?? 0),
      explanation: String(parsed.explanation ?? ''),
      prompt,
      raw: parsed,
    };
  }
}
