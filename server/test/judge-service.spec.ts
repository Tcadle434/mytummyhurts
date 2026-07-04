import { describe, expect, it } from 'vitest';

import { JudgeService } from '../src/eval/judge.service';

// setup-env.ts deletes OPENAI_API_KEY for the hermetic suite, which is exactly
// the path under test: a missing key must yield a SKIP, never a free pass.
describe('JudgeService without OPENAI_API_KEY', () => {
  it('returns a skipped verdict instead of pass:true score:1', async () => {
    // Arrange
    const judge = new JudgeService();

    // Act
    const verdict = await judge.judge({ preset: 'groundedness', outputs: 'Some explanation.' });

    // Assert
    expect(verdict.skipped).toBe(true);
    expect(verdict.score).toBe(0);
    expect(verdict.explanation).toMatch(/skipped/i);
    // Neutral for legacy callers that only look at pass, but callers computing
    // pass rates must filter on skipped.
    expect(verdict.pass).toBe(true);
  });
});
