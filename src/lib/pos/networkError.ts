/** True when a fetch failed because the device is offline or the request never reached the server. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /failed to fetch|network|offline|load failed|aborted/i.test(
      error.message,
    );
  }
  return false;
}
