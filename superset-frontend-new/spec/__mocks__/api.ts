import { vi } from "vitest";

const mockAxios = {
  get: vi.fn().mockResolvedValue({ data: {} }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  patch: vi.fn().mockResolvedValue({ data: {} }),
  delete: vi.fn().mockResolvedValue({ data: {} }),
  defaults: {
    headers: {
      common: {} as Record<string, string>,
    },
  },
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
  create: vi.fn().mockReturnThis(),
};

export default mockAxios;
export const getStoredToken = vi.fn(() => null);
export const setStoredToken = vi.fn();
