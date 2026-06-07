/**
 * Output formatting helpers for the oc CLI.
 *
 * Two modes:
 *  - table (default): padded column output suited for human reading.
 *  - json:            raw JSON.stringify, suitable for piping to jq etc.
 */

/** Supported output format values. */
export type OutputFormat = "table" | "json";

/**
 * Print data in the requested format.
 *
 * @param data   - Value to display. Must be JSON-serialisable.
 * @param format - "table" or "json".
 * @param columns - Column keys to show in table mode (in display order).
 */
export function print(data: unknown, format: OutputFormat, columns?: string[]): void
{
  if (format === "json")
  {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (Array.isArray(data))
  {
    printTable(data as Record<string, unknown>[], columns);
  }
  else if (data && typeof data === "object")
  {
    printRecord(data as Record<string, unknown>, columns);
  }
  else
  {
    console.log(String(data));
  }
}

/**
 * Print an array of objects as an aligned ASCII table.
 *
 * @param rows    - Rows to display.
 * @param columns - Keys to include (in order). Defaults to all keys from first row.
 */
function printTable(rows: Record<string, unknown>[], columns?: string[]): void
{
  if (rows.length === 0)
  {
    console.log("(no results)");
    return;
  }

  const keys = columns ?? Object.keys(rows[0] ?? {});
  const widths = keys.map(function _headerWidth(k)
  {
    return Math.max(k.length, ...rows.map(function _cellWidth(r)
    {
      return String(_cell(r[k])).length;
    }));
  });

  const header = keys.map(function _padHeader(k, i)
  {
    return k.toUpperCase().padEnd(widths[i] ?? 0);
  }).join("  ");

  const divider = widths.map(function _line(w)
  {
    return "-".repeat(w);
  }).join("  ");

  console.log(header);
  console.log(divider);

  for (const row of rows)
  {
    console.log(keys.map(function _padCell(k, i)
    {
      return String(_cell(row[k])).padEnd(widths[i] ?? 0);
    }).join("  "));
  }
}

/**
 * Print a single object as a two-column key/value table.
 *
 * @param record  - Object to display.
 * @param columns - Keys to include. Defaults to all keys.
 */
function printRecord(record: Record<string, unknown>, columns?: string[]): void
{
  const keys = columns ?? Object.keys(record);
  const keyWidth = Math.max(...keys.map(function _len(k) { return k.length; }));

  for (const k of keys)
  {
    console.log(`${k.padEnd(keyWidth)}  ${_cell(record[k])}`);
  }
}

/**
 * Render a cell value as a display string.
 * Arrays are summarised as a count; objects as JSON.
 */
function _cell(value: unknown): string
{
  if (value === null || value === undefined)
  {
    return "";
  }
  if (Array.isArray(value))
  {
    return value.length === 0 ? "[]" : `[${value.length} items]`;
  }
  if (typeof value === "object")
  {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Print a success message in a consistent style.
 *
 * @param message - Message to display.
 */
export function printSuccess(message: string): void
{
  console.log(`✓ ${message}`);
}

/**
 * Print an API error and exit with code 1.
 *
 * @param operation - Operation name for context.
 * @param error     - Error body from the API response.
 */
export function printApiError(operation: string, error: unknown): never
{
  const body = error as Record<string, unknown> | undefined;
  const msg = body?.error ?? "unexpected error";
  const code = body?.code ? ` [${String(body.code)}]` : "";
  console.error(`error: ${operation} failed — ${String(msg)}${code}`);
  process.exit(1);
}
