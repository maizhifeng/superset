export interface PersonNameParts {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
}

/**
 * Display name for a Superset user/owner profile.
 *
 * Latin profiles read "Given Family"; this deployment stores CJK profiles with
 * the surname in ``first_name`` (刘 / 小涵), so they read surname-first without
 * a space. Falls back to username/email when the name fields are empty.
 */
export function formatPersonName(
  person: PersonNameParts | null | undefined,
): string {
  if (!person) return "";
  const first = (person.first_name ?? "").trim();
  const last = (person.last_name ?? "").trim();
  if (first && last) {
    return /[A-Za-z]/.test(first + last)
      ? `${first} ${last}`
      : `${first}${last}`;
  }
  return (
    first || last || (person.username ?? "").trim() || (person.email ?? "")
  );
}
