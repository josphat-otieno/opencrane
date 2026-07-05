import type { AwarenessResult } from "@opencrane/awareness";

/**
 * Render an {@link AwarenessResult} as the plain-text block returned to the agent
 * through the `memory_search` MCP tool.
 *
 * Every hit is printed with its enforced citation (title + URI + freshness) so the
 * agent can attribute any org fact it uses — the citation invariant is the whole
 * point of routing retrieval through `@opencrane/awareness` rather than letting the
 * runtime hit Cognee raw. Uncitable hits never reach here (the SDK drops them); we
 * surface the dropped COUNT so the agent knows retrieval was lossy rather than empty.
 *
 * @param result - The awareness result to format.
 * @returns A human/agent-readable, citation-carrying text block.
 */
export function _FormatAwarenessResult(result: AwarenessResult): string
{
  const lines: string[] = [];

  if (result.hits.length === 0)
  {
    lines.push(`No org-memory results for: "${result.query}".`);
  }
  else
  {
    lines.push(`Org-memory results for: "${result.query}"`);
    lines.push("");
    result.hits.forEach(function _renderHit(hit, index)
    {
      const scope = hit.datasets.length > 0 ? ` [${hit.datasets.join(", ")}]` : "";
      lines.push(`${index + 1}. ${hit.content}`);
      lines.push(`   Source: ${hit.citation.title} — ${hit.citation.uri} (updated ${hit.citation.freshnessTimestamp})${scope}`);
    });
  }

  // Always disclose withheld uncitable hits so "empty" is never confused with "lossy".
  if (result.droppedUncitable > 0)
  {
    lines.push("");
    lines.push(`(${result.droppedUncitable} uncitable result${result.droppedUncitable === 1 ? "" : "s"} withheld — no verifiable source.)`);
  }

  return lines.join("\n");
}
