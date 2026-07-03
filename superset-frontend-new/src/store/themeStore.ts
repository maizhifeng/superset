import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "paper" | "notion";

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "paper",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "paper" ? "notion" : "paper" })),
    }),
    {
      name: "starfly-theme",
      migrate: (persisted: unknown) => {
        const state = persisted as { theme?: string };
        if (state?.theme === "vibrant") {
          return { theme: "notion" as const };
        }
        return { theme: (state?.theme as ThemeMode) ?? "paper" };
      },
    },
  ),
);
