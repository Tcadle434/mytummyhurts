export declare const SHARED_DOMAIN_VERSION = "0.1.0";
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
export * from './gut-score';
export * from './profile';
export * from './menu';
export * from './scan';
export * from './scoring-constants';
export * from './scoring-utils';
export * from './scoring-data';
