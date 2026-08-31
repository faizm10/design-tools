import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center border px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "border-black bg-black text-white hover:bg-white hover:text-black",
        variant === "secondary" &&
          "border-gray-300 bg-white text-black hover:border-black",
        variant === "ghost" &&
          "border-transparent bg-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
