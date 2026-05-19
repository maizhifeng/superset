import { create } from "zustand";

export interface Notification {
  id: string;
  severity: "success" | "error" | "info" | "warning";
  message: string;
  action?: { label: string; onClick: () => void };
}

interface NotificationState {
  notifications: Notification[];
  notify: (n: Omit<Notification, "id">) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  notify: (n) => {
    const id = `notif_${++counter}`;
    set((state) => ({ notifications: [...state.notifications, { ...n, id }] }));
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((x) => x.id !== id),
      }));
    }, 4000);
  },
  dismiss: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((x) => x.id !== id),
    })),
}));
