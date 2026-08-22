/** Shared perf-probe credentials (override with E2E_USER / E2E_PASSWORD). */
export const E2E_USER_DEFAULT =
  process.env.E2E_USER ?? "zhifeng.mai@rastar.com";
export const E2E_PASSWORD_DEFAULT = process.env.E2E_PASSWORD ?? "admin123";
