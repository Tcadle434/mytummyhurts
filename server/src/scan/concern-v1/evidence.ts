import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import {
  CONCERN_MECHANISM_KEYS,
  SUPPORTED_CONDITION_KEYS,
  type ConcernEvidenceClaim,
} from './domain';

const sourceSchema = z.object({
  title: z.string().trim().min(1),
  organization: z.string().trim().min(1),
  url: z.string().url(),
  publishedYear: z.number().int().min(2000).max(2100),
  sourceType: z.enum([
    'clinical_guideline',
    'government_health',
    'patient_guidance',
    'clinical_practice_update',
    'randomized_trial',
  ]),
}).strict();

const claimSchema = z.object({
  id: z.string().regex(/^claim_[a-z0-9_]+$/),
  conditions: z.array(z.enum(SUPPORTED_CONDITION_KEYS)).min(1),
  mechanisms: z.array(z.enum(CONCERN_MECHANISM_KEYS)).min(1),
  direction: z.enum(['raises', 'lowers', 'context']),
  strength: z.enum(['high', 'moderate', 'limited']),
  summary: z.string().trim().min(1),
  applicability: z.string().trim().min(1),
  limitations: z.string().trim().min(1),
  source: sourceSchema,
}).strict();

const catalogSchema = z.object({
  version: z.string().trim().min(1),
  reviewedAt: z.string().datetime(),
  claims: z.array(claimSchema).min(1),
}).strict().superRefine((catalog, context) => {
  const ids = catalog.claims.map((claim) => claim.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['claims'], message: 'Claim ids must be unique.' });
  }
});

type ConcernEvidenceCatalog = z.infer<typeof catalogSchema>;

let cachedCatalog: ConcernEvidenceCatalog | null = null;

function catalogPath() {
  const candidates = [
    join(process.cwd(), 'data', 'concern-v1', 'evidence-claims.json'),
    join(__dirname, '..', '..', '..', 'data', 'concern-v1', 'evidence-claims.json'),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
      // Try the next runtime layout.
    }
  }
  throw new Error('concern_v1_evidence_catalog_missing');
}

export function loadConcernEvidenceCatalog(): {
  version: string;
  claims: ConcernEvidenceClaim[];
} {
  if (!cachedCatalog) {
    cachedCatalog = catalogSchema.parse(JSON.parse(readFileSync(catalogPath(), 'utf8')));
  }
  return {
    version: cachedCatalog.version,
    claims: cachedCatalog.claims,
  };
}

export function resetConcernEvidenceCatalogForTests() {
  cachedCatalog = null;
}
