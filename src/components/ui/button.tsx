import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "glass" | "destructive";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-glass hover:bg-primary/90 active:bg-primary/80",
  secondary:
    "border border-border bg-surface/80 text-foreground shadow-glass backdrop-blur-xl hover:bg-surface active:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground",
  glass:
    "border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.64)_0%,rgba(255,255,255,0.40)_100%)] text-neutral-900 shadow-[0_16px_24px_-14px_rgba(15,23,42,0.34),inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(255,255,255,0.34)] backdrop-blur-xl backdrop-saturate-200 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(255,255,255,0.50)_100%)] active:bg-[linear-gradient(180deg,rgba(255,255,255,0.56)_0%,rgba(255,255,255,0.34)_100%)]",
  destructive:
    "bg-destructive text-destructive-foreground shadow-glass hover:bg-destructive/90 active:bg-destructive/80",
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
        "inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-[background-color,color,transform] duration-100 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100",
        variantClasses[variant],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
