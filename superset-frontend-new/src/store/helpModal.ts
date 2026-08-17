import { create } from "zustand";

interface HelpModalState {
  open: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
}

/**
 * 键盘快捷键帮助弹窗的显隐（全局会话级）：
 * 既可通过 ?/ 快捷键触发，也可从用户菜单等入口打开。
 */
export const useHelpModalStore = create<HelpModalState>()((set, get) => ({
  open: false,
  openHelp: () => set({ open: true }),
  closeHelp: () => set({ open: false }),
  toggleHelp: () => set({ open: !get().open }),
}));
