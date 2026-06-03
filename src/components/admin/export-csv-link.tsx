import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminExportResource } from "@/lib/export/admin-export";

type ExportCsvLinkProps = {
  label: string;
  resource: AdminExportResource;
  searchParams: Record<string, string | undefined>;
  variant?: "primary" | "secondary" | "ghost" | "glass";
};

export function ExportCsvLink({
  label,
  resource,
  searchParams,
  variant = "secondary",
}: ExportCsvLinkProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  const href = `/api/admin/export/${resource}${query ? `?${query}` : ""}`;

  const variantClasses = {
    primary:
      "bg-primary text-primary-foreground shadow-glass hover:bg-primary/90",
    secondary:
      "border border-border bg-surface/80 text-foreground shadow-glass backdrop-blur-xl hover:bg-surface",
    ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
    glass:
      "border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.64)_0%,rgba(255,255,255,0.40)_100%)] text-neutral-900 shadow-[0_16px_24px_-14px_rgba(15,23,42,0.34)] backdrop-blur-xl hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(255,255,255,0.50)_100%)]",
  } as const;

  return (
    <a
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors",
        variantClasses[variant],
      )}
      download
      href={href}
    >
      <Download className="mr-2 size-4 shrink-0" aria-hidden="true" />
      {label}
    </a>
  );
}
