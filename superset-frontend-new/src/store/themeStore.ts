import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "paper" | "vibrant";

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
        set((s) => ({ theme: s.theme === "paper" ? "vibrant" : "paper" })),
    }),
    { name: "starfly-theme" },
  ),
);
