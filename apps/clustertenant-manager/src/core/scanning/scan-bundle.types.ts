/** Severity level reported by the scanner for a finding. */
export type ScanFindingSeverity = "critical" | "high" | "medium" | "low" | "unknown";

/** A single finding emitted by the vulnerability scanner. */
export interface ScanFinding
{
  /** Unique identifier assigned by the scanner or CVE database. */
  id: string;

  /** Brief description of the finding. */
  description: string;

  /** Assessed severity level. */
  severity: ScanFindingSeverity;

  /** Package or artifact where the finding was identified. */
  location: string;
}

/** Successful scan outcome. */
export interface ScanResultPassed
{
  /** Discriminant — scan completed without blocking findings. */
  passed: true;

  /** Informational findings below the blocking threshold. */
  findings: ScanFinding[];

  /** Name of the scanner tool that produced this result. */
  scanner: string;
}

/** Failed scan outcome. */
export interface ScanResultFailed
{
  /** Discriminant — scan found blocking findings or the scanner is unavailable. */
  passed: false;

  /** Reason for failure; populated when the scanner could not run. */
  reason?: string;

  /** Findings that caused the scan to fail. */
  findings: ScanFinding[];

  /** Name of the scanner tool that produced this result (empty when unavailable). */
  scanner: string;
}

/** Union of scan outcomes. */
export type ScanResult = ScanResultPassed | ScanResultFailed;
