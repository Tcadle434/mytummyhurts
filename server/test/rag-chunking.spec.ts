import { describe, expect, it } from 'vitest';

import { chunkDocument } from '../src/rag/chunking';

describe('structure-aware chunking', () => {
  it('splits by headings, sets heading paths, and emits parent + child chunks', () => {
    const md = [
      '# IBS Trigger Foods',
      'Overview of common IBS triggers.',
      '## Garlic',
      'Garlic is high in fructans and a common FODMAP trigger.',
      '## Rice',
      'Plain white rice is gentle and low FODMAP.',
    ].join('\n');

    const chunks = chunkDocument(md);
    expect(chunks.some((c) => c.isParent)).toBe(true);
    expect(chunks.some((c) => !c.isParent)).toBe(true);

    const garlic = chunks.find((c) => c.content.includes('fructans'));
    expect(garlic?.headingPath).toContain('Garlic');
    expect(garlic?.headingPath).toContain('IBS Trigger Foods');
  });
});
