/**
 * Returns today's date key in YYYY-MM-DD format for a given IANA timezone.
 */
export function todayDateKey(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

/**
 * Converts a timestamp to a date key in the given timezone.
 */
export function timestampToDateKey(
  timestamp: number,
  timezone: string
): string {
  return new Date(timestamp).toLocaleDateString("en-CA", {
    timeZone: timezone,
  });
}
