import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ScanFinding, ScanResult } from "./scan-bundle.types.js";

const _execFileAsync = promisify(execFile);

/** Blocking severity levels — findings at or above these levels fail the scan. */
const _BLOCKING_SEVERITIES = new Set(["critical", "high"]);

/**
 * Scan skill bundle content for vulnerabilities using Grype or Trivy.
 *
 * Writes the bundle content to a temp file, shells out to the first
 * available scanner, and parses its JSON output. When neither scanner
 * is on the PATH the result is `passed: false` with `reason: "scanner-unavailable"`
 * so the caller must either skip the bundle or hold it in `scanning` state until
 * a scanner is configured.
 *
 * **Blocking threshold:** critical and high findings fail the scan. Medium, low,
 * and unknown findings are reported as informational but do not block promotion.
 *
 * @param bundleId  - Unique bundle identifier used for the temp file name.
 * @param content   - Raw text content of the skill bundle to scan.
 * @returns Resolved scan outcome with findings.
 */
export async function _ScanBundleContent(bundleId: string, content: string): Promise<ScanResult>
{
  const tempDir = join("/tmp", `opencrane-scan-${bundleId}`);
  const contentPath = join(tempDir, "skill-bundle.md");

  try
  {
    // 1. Write bundle content to an isolated temp directory so the scanner
    //    has a clean filesystem root to inspect.
    await mkdir(tempDir, { recursive: true });
    await writeFile(contentPath, content, "utf8");

    // 2. Attempt Grype first, then Trivy — use whichever is on the PATH.
    const scanner = await _detectScanner();
    if (!scanner)
    {
      return { passed: false, reason: "scanner-unavailable", findings: [], scanner: "" };
    }

    const findings = scanner === "grype"
      ? await _runGrype(tempDir)
      : await _runTrivy(tempDir);

    const blocking = findings.filter(function _isBlocking(f)
    {
      return _BLOCKING_SEVERITIES.has(f.severity);
    });

    if (blocking.length > 0)
    {
      return { passed: false, findings, scanner };
    }

    return { passed: true, findings, scanner };
  }
  finally
  {
    // 3. Always remove the temp directory regardless of outcome to prevent
    //    accumulation of scan artifacts on the control-plane filesystem.
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Probe the PATH for a supported scanner.
 * Returns the first available scanner name, or null when neither is installed.
 *
 * @returns "grype", "trivy", or null.
 */
async function _detectScanner(): Promise<"grype" | "trivy" | null>
{
  for (const name of ["grype", "trivy"] as const)
  {
    try
    {
      await _execFileAsync(name, ["version"]);
      return name;
    }
    catch
    {
      // not on PATH — try next
    }
  }
  return null;
}

/**
 * Run Grype against the given directory and parse findings.
 *
 * @param dir - Absolute path to the directory to scan.
 * @returns Parsed findings array.
 */
async function _runGrype(dir: string): Promise<ScanFinding[]>
{
  const { stdout } = await _execFileAsync("grype", [
    `dir:${dir}`,
    "--output", "json",
    "--quiet",
  ]);

  const parsed = JSON.parse(stdout) as { matches?: Array<{
    vulnerability: { id: string; description?: string; severity: string };
    artifact: { locations?: Array<{ realPath: string }> };
  }> };

  return (parsed.matches ?? []).map(function _mapMatch(match): ScanFinding
  {
    return {
      id: match.vulnerability.id,
      description: match.vulnerability.description ?? match.vulnerability.id,
      severity: _normaliseSeverity(match.vulnerability.severity),
      location: match.artifact.locations?.[0]?.realPath ?? dir,
    };
  });
}

/**
 * Run Trivy against the given directory and parse findings.
 *
 * @param dir - Absolute path to the directory to scan.
 * @returns Parsed findings array.
 */
async function _runTrivy(dir: string): Promise<ScanFinding[]>
{
  const { stdout } = await _execFileAsync("trivy", [
    "fs", dir,
    "--format", "json",
    "--quiet",
  ]);

  const parsed = JSON.parse(stdout) as { Results?: Array<{
    Target: string;
    Vulnerabilities?: Array<{ VulnerabilityID: string; Description?: string; Severity: string }>;
  }> };

  const findings: ScanFinding[] = [];
  for (const result of (parsed.Results ?? []))
  {
    for (const vuln of (result.Vulnerabilities ?? []))
    {
      findings.push({
        id: vuln.VulnerabilityID,
        description: vuln.Description ?? vuln.VulnerabilityID,
        severity: _normaliseSeverity(vuln.Severity),
        location: result.Target,
      });
    }
  }
  return findings;
}

/**
 * Normalise a raw scanner severity string to the canonical lowercase form.
 *
 * @param raw - Raw severity string from scanner output.
 * @returns Normalised severity level.
 */
function _normaliseSeverity(raw: string): ScanFinding["severity"]
{
  switch (raw.toLowerCase())
  {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    default: return "unknown";
  }
}
