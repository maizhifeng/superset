import { test, expect, vi } from "vitest";
import {
  FEDERATED_DATASETS,
  isFederatedDataset,
  refreshFederatedDatasets,
} from "@/config/federatedDatasets";

const baseIds = [...FEDERATED_DATASETS];

test("refreshFederatedDatasets merges server list into the Set", async () => {
  const apiGet = vi.fn(() =>
    Promise.resolve({ data: { result: [100, 200] } }),
  );
  await refreshFederatedDatasets(apiGet as any);
  expect(apiGet).toHaveBeenCalledWith("/bi/federated-datasets");
  expect(isFederatedDataset(100)).toBe(true);
  expect(isFederatedDataset(200)).toBe(true);
  // Pre-existing fallback ids are preserved.
  for (const id of baseIds) expect(isFederatedDataset(id)).toBe(true);
});

test("refreshFederatedDatasets falls back silently on error", async () => {
  const apiGet = vi.fn(() => Promise.reject(new Error("boom")));
  await expect(refreshFederatedDatasets(apiGet as any)).resolves.toBeUndefined();
});
