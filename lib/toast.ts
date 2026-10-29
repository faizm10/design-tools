import { create } from "zustand";

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  tone?: "default" | "error";
}

export const useToast = create<{ toast: Toast | null; show: (t: Omit<Toast, "id">) => void; dismiss: () => void }>()((set) => ({
  toast: null,
  show: (t) => set({ toast: { ...t, id: Date.now() } }),
  dismiss: () => set({ toast: null }),
}));

export const toast = (message: string, extra: Omit<Toast, "id" | "message"> = {}) => useToast.getState().show({ message, ...extra });
