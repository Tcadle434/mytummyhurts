"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARED_DOMAIN_VERSION = void 0;
// Single source of truth for domain + API contract types shared between the
// Expo app (src/types/domain.ts, src/services/api/contracts.ts) and the NestJS
// server. The real type definitions are migrated here in Phase 6; this skeleton
// exists so both projects can depend on the package from Phase 0 onward.
exports.SHARED_DOMAIN_VERSION = '0.1.0';
// ---------------------------------------------------------------------------
// Shared domain type graph — migrated out of the duplicated definitions in
// src/types/domain.ts (Expo) and server/src/scan/engine/domain.ts (NestJS).
// Both domain.ts files re-export these so existing call sites are unaffected.
// ---------------------------------------------------------------------------
__exportStar(require("./gut-score"), exports);
__exportStar(require("./profile"), exports);
__exportStar(require("./menu"), exports);
__exportStar(require("./scan"), exports);
// ---------------------------------------------------------------------------
// Shared scoring VALUE exports — constants, pure utilities, and data tables
// that were byte-identical in src/services/ai/scoring.ts (Expo) and
// server/src/scan/engine/scoring.ts (NestJS). Both scoring.ts files import
// these so the duplicated definitions are removed without changing behavior.
// ---------------------------------------------------------------------------
__exportStar(require("./scoring-constants"), exports);
__exportStar(require("./scoring-utils"), exports);
__exportStar(require("./scoring-data"), exports);
