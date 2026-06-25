import { LayoutList } from "lucide-react";

export function BoardEmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[5px] px-10 pb-[124px] text-center">
      <LayoutList
        className="mb-[14px] text-[hsl(220_12%_76%)]"
        size={64}
        aria-hidden="true"
      />
      <p className="text-[14px] font-extrabold text-foreground">{title}</p>
      <p className="text-[12px] font-semibold text-muted-foreground">{subtitle}</p>
    </div>
  );
}
