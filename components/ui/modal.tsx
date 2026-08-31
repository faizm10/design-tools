"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, children, onClose }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4">
      <div
        aria-modal="true"
        className="w-full max-w-md border border-gray-300 bg-white p-5 shadow-sm"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-medium text-black">{title}</h2>
          <button
            aria-label="Close modal"
            className="grid size-7 place-items-center border border-gray-200 text-gray-500 hover:border-black hover:text-black"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>
        <div className="mt-4 text-sm leading-6 text-gray-600">{children}</div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
