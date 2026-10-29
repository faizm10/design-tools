"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, onClose, children, width = "max-w-sm" }: { title: string; onClose: () => void; children: ReactNode; width?: string }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog so keyboard users land on the first field.
    panel.current?.querySelector<HTMLElement>("input, button:not([data-close])")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4 backdrop-blur-[2px]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`animate-panel-in relative w-full ${width} rounded-2xl bg-white shadow-2xl ring-1 ring-stone-200`}>
        <button type="button" data-close onClick={onClose} aria-label="Close" className="absolute top-3.5 right-3.5 rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700">
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
