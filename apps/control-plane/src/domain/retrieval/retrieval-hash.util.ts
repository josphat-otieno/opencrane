/**
 * Produce a short deterministic fingerprint of a query string for audit log storage.
 * Uses a simple djb2-style hash; not a cryptographic hash.
 * The loop bound is the minimum of a hardcoded constant and the string length
 * to prevent loop-bound injection on user-controlled input.
 */
export function _HashQuery(query: string): string
{
  /** Maximum number of characters to hash — prevents unbounded iteration on large inputs. */
  const MAX_HASH_CHARS = 1024;
  let hash = 5381;
  // Use a constant upper bound so the loop count cannot be driven by user input alone.
  for (let i = 0; i < MAX_HASH_CHARS && i < query.length; i++)
  {
    hash = ((hash << 5) + hash) + query.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(16).padStart(8, "0");
}
