import { useCallback, useEffect, useState } from "react";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import {
  buildStartMaps,
  type ProfitSharingStartRow,
  type StartMaps,
} from "@/pages/Dashboard/compareStartDate";
import {
  buildProjectOptions,
  type ProjectGameRow,
  type ProjectOption,
} from "../projectCompare";

/**
 * Project metadata for the comparison page, shared by the filter bar (project
 * picker) and the comparison view (window planning).
 *
 * Both controls mount at the same time, so the two requests are deduplicated
 * and the result is cached for the session: switching topics or remounting the
 * view never refetches the game list.
 */
export interface ProjectCompareOptions {
  options: ProjectOption[];
  startMaps: StartMaps;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface LoadedOptions {
  options: ProjectOption[];
  startMaps: StartMaps;
}

let cached: LoadedOptions | null = null;
let inFlight: Promise<LoadedOptions> | null = null;

async function loadOptions(): Promise<LoadedOptions> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = Promise.all([
      api.get<{ result: ProjectGameRow[] }>("/project/papp"),
      api.get<{ result: ProfitSharingStartRow[] }>("/project/profit-sharing"),
    ])
      .then(([gamesResponse, profitResponse]) => {
        const startMaps = buildStartMaps(profitResponse.data?.result ?? []);
        const loaded: LoadedOptions = {
          startMaps,
          options: buildProjectOptions(
            gamesResponse.data?.result ?? [],
            startMaps,
          ),
        };
        cached = loaded;
        return loaded;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

const EMPTY_START_MAPS: StartMaps = buildStartMaps([]);

/** Drop the cached project metadata (used by tests and force refresh). */
export function clearProjectCompareOptionsCache(): void {
  cached = null;
  inFlight = null;
}

export function useProjectCompareOptions(): ProjectCompareOptions {
  const [state, setState] = useState<LoadedOptions | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    if (cached) {
      setState(cached);
      setLoading(false);
      setError(null);
      return undefined;
    }
    setLoading(true);
    setError(null);
    void loadOptions()
      .then((loaded) => {
        if (!active) return;
        setState(loaded);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(parseErrorMessage(loadError, "项目列表加载失败"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    cached = null;
    inFlight = null;
    setState(null);
    setReloadToken((value) => value + 1);
  }, []);

  return {
    options: state?.options ?? [],
    startMaps: state?.startMaps ?? EMPTY_START_MAPS,
    loading,
    error,
    reload,
  };
}
