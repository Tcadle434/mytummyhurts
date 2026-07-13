import { describe, expect, it } from "vitest";

import {
	knowBeforeEatCtaLabel,
	nextKnowBeforeEatStageOnTap,
	previousKnowBeforeEatStage,
	type KnowBeforeEatStage,
} from "../components/KnowBeforeEatFlow";

describe("Know Before Eat flow", () => {
	it.each<[KnowBeforeEatStage, string]>([
		["menu-scan", "Scan"],
		["menu-loading", "Analyzing..."],
		["menu-result", "Scan food"],
		["food-scan", "Scan"],
		["food-loading", "Analyzing..."],
		["food-result", "Scan grocery item"],
		["barcode-scan", "Scan"],
		["barcode-loading", "Analyzing..."],
		["barcode-result", "Show me my Gut Score"],
	])("uses the expected CTA for %s", (stage, label) => {
		expect(knowBeforeEatCtaLabel(stage)).toBe(label);
	});

	it.each<[KnowBeforeEatStage, KnowBeforeEatStage | "advance" | null]>([
		["menu-scan", "menu-loading"],
		["menu-loading", null],
		["menu-result", "food-scan"],
		["food-scan", "food-loading"],
		["food-loading", null],
		["food-result", "barcode-scan"],
		["barcode-scan", "barcode-loading"],
		["barcode-loading", null],
		["barcode-result", "advance"],
	])("advances %s to %s", (stage, nextStage) => {
		expect(nextKnowBeforeEatStageOnTap(stage)).toBe(nextStage);
	});

	it.each<[KnowBeforeEatStage, KnowBeforeEatStage]>([
		["menu-scan", "menu-scan"],
		["menu-loading", "menu-scan"],
		["menu-result", "menu-scan"],
		["food-scan", "menu-result"],
		["food-loading", "food-scan"],
		["food-result", "food-scan"],
		["barcode-scan", "food-result"],
		["barcode-loading", "barcode-scan"],
		["barcode-result", "barcode-scan"],
	])("moves %s back to %s", (stage, previousStage) => {
		expect(previousKnowBeforeEatStage(stage)).toBe(previousStage);
	});
});
