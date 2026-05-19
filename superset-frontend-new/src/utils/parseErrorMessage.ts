export function parseErrorMessage(
  err: unknown,
  fallback = "An error occurred",
): string {
  if (err instanceof Error) return err.message;

  const apiErr = err as
    | { response?: { data?: { message?: string } } }
    | undefined;

  return apiErr?.response?.data?.message ?? fallback;
}
