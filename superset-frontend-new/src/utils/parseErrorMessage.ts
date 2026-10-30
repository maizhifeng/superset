export function parseErrorMessage(
  err: unknown,
  fallback = "An error occurred",
): string {
  const apiErr = err as
    | {
        response?: { data?: { message?: string }; status?: number };
        message?: string;
      }
    | undefined;

  const serverMessage = apiErr?.response?.data?.message;
  if (typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage;
  }

  if (err instanceof Error) {
    // Axios surfaces transport failures as English boilerplate; keep the
    // caller's localized fallback instead of showing "Request failed ...".
    if (
      /^Request failed with status code \d+$/.test(err.message) ||
      err.message === "Network Error"
    ) {
      return fallback;
    }
    return err.message;
  }

  return fallback;
}
