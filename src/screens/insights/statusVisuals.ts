import type { TriggerStatus } from "../../features/insights/triggerProfile";

// Plain-words labels for the five caseboard verdicts. The visual tones live in
// tokens.color.status.verdict — TriggerStatus keys map 1:1 onto the verdict
// tone keys, so a status can be passed straight to VerdictPill/verdictTone.
export const STATUS_LABEL: Record<TriggerStatus, string> = {
	confirmed: "Confirmed",
	suspect: "Under review",
	watching: "Watching",
	cleared: "Cleared",
	safe: "Looking safe",
};
