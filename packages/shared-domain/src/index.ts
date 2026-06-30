// Single source of truth for domain + API contract types shared between the
// Expo app (src/types/domain.ts, src/services/api/contracts.ts) and the NestJS
// server. The real type definitions are migrated here in Phase 6; this skeleton
// exists so both projects can depend on the package from Phase 0 onward.
export const SHARED_DOMAIN_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Risk primitives — shared verbatim by the Expo app (src/types/domain.ts) and
// the NestJS server (server/src/scan/engine/domain.ts). Both re-export these so
// existing `import { RiskLevel } from '.../domain'` call sites are unaffected.
// ---------------------------------------------------------------------------
export type RiskLevel = 'low' | 'medium' | 'high';
export type PatternStrength = 'weak' | 'moderate' | 'strong';

/**
 * Optional, additive citation surfaced on scan / condition-risk / ingredient-risk
 * / menu-item results when RAG evidence is used. Additive => existing screens are
 * unaffected; a later UI task renders these. Empty/absent when RAG is off.
 */
export interface EvidenceCitation {
  id: string;
  title: string;
  source: string;
  url?: string;
  documentType?: string;
  chunkId?: string;
  snippet?: string;
  relevanceScore?: number;
}

// ---------------------------------------------------------------------------
// Shared domain type graph — migrated out of the duplicated definitions in
// src/types/domain.ts (Expo) and server/src/scan/engine/domain.ts (NestJS).
// Both domain.ts files re-export these so existing call sites are unaffected.
// ---------------------------------------------------------------------------
export * from './gut-score';
export * from './profile';
export * from './menu';
export * from './scan';

// ---------------------------------------------------------------------------
// Shared scoring VALUE exports — constants, pure utilities, and data tables
// that were byte-identical in src/services/ai/scoring.ts (Expo) and
// server/src/scan/engine/scoring.ts (NestJS). Both scoring.ts files import
// these so the duplicated definitions are removed without changing behavior.
// ---------------------------------------------------------------------------
export * from './scoring-constants';
export * from './scoring-utils';
export * from './scoring-data';
