"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeKey = normalizeKey;
exports.clamp = clamp;
exports.clampNumber = clampNumber;
exports.roundWeight = roundWeight;
exports.confidenceRank = confidenceRank;
exports.strongerConfidence = strongerConfidence;
exports.frequencyRiskIndex = frequencyRiskIndex;
exports.severityRiskIndex = severityRiskIndex;
exports.baselineFrequencyPenalty = baselineFrequencyPenalty;
exports.baselineSeverityPenalty = baselineSeverityPenalty;
exports.scoreEventTime = scoreEventTime;
exports.withinDays = withinDays;
exports.combinedRiskScore = combinedRiskScore;
exports.profileConfidenceLevel = profileConfidenceLevel;
const scoring_constants_1 = require("./scoring-constants");
function normalizeKey(value) {
    return value.trim().toLowerCase();
}
function clamp(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
function clampNumber(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}
function roundWeight(value) {
    return Math.round(value * 100) / 100;
}
function confidenceRank(confidence) {
    switch (confidence) {
        case 'high':
            return 3;
        case 'medium':
            return 2;
        case 'low':
        default:
            return 1;
    }
}
function strongerConfidence(left, right) {
    return confidenceRank(left) >= confidenceRank(right) ? left : right;
}
function frequencyRiskIndex(symptomFrequency) {
    switch (normalizeKey(symptomFrequency ?? '')) {
        case 'almost daily':
            return 4;
        case 'a few times a week':
            return 3;
        case 'a few times a month':
            return 2;
        case 'rarely':
            return 1;
        default:
            return 0;
    }
}
function severityRiskIndex(symptomSeverityBaseline) {
    switch (normalizeKey(symptomSeverityBaseline ?? '')) {
        case 'severe':
            return 4;
        case 'it varies a lot':
            return 3;
        case 'moderate':
            return 2;
        case 'mild':
            return 1;
        default:
            return 0;
    }
}
function baselineFrequencyPenalty(symptomFrequency) {
    switch (normalizeKey(symptomFrequency ?? '')) {
        case 'frequently throughout the day':
        case 'almost daily':
            return 25;
        case 'a few times a week':
            return 16;
        case 'a few times a month':
            return 8;
        case 'rarely':
            return 0;
        default:
            return 4;
    }
}
function baselineSeverityPenalty(symptomSeverityBaseline) {
    switch (normalizeKey(symptomSeverityBaseline ?? '')) {
        case 'severe':
            return 26;
        case 'it varies a lot':
            return 18;
        case 'moderate':
            return 12;
        case 'mild':
            return 0;
        default:
            return 6;
    }
}
function scoreEventTime(value) {
    const time = value ? new Date(value).getTime() : Date.now();
    return Number.isFinite(time) ? time : Date.now();
}
function withinDays(value, days, nowMs) {
    return nowMs - scoreEventTime(value) <= days * 24 * 60 * 60 * 1000;
}
function combinedRiskScore(triggerScore, safeScore) {
    return clamp(50 + triggerScore - safeScore);
}
function profileConfidenceLevel(pairedReportDays = 0, pairedMealScans = 0) {
    if (pairedReportDays >= scoring_constants_1.PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedReportDays &&
        pairedMealScans >= scoring_constants_1.PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedMealScans) {
        return 'confident';
    }
    if (pairedReportDays >= scoring_constants_1.PROFILE_LEARNING_STAGE_THRESHOLDS.growing.pairedReportDays &&
        pairedMealScans >= scoring_constants_1.PROFILE_LEARNING_STAGE_THRESHOLDS.growing.pairedMealScans) {
        return 'growing';
    }
    return 'early';
}
