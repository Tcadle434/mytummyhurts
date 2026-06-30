"use strict";
// Scan input/extraction/result domain types. Shared verbatim by the Expo app
// (src/types/domain.ts) and the NestJS server (server/src/scan/engine/domain.ts).
//
// NOTE: StructuredAnalysisV2, MenuScanAnalysis, MenuItemAnalysis, ScanResult and
// ScanRecord are intentionally NOT shared here — they diverge between the apps
// (the server adds scoring-internal fields) and remain defined locally in each
// domain.ts. The pieces below are the parts that are byte-for-byte identical.
Object.defineProperty(exports, "__esModule", { value: true });
