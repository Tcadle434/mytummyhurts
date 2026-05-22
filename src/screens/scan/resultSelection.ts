import { ScanRecord } from "../../types/domain";

export function hasMenuResult(scan: ScanRecord | undefined) {
	return scan?.scanCategory === "menu" && (Boolean(scan.menuResult) || Boolean(scan.structuredAnalysis.menuAnalysis));
}

export function selectPreferredScan(
	storeScan: ScanRecord | undefined,
	detailScan: ScanRecord | undefined
) {
	return detailScan ?? storeScan;
}
