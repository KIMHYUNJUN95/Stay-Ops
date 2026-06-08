import Image from "next/image";

type AnnouncementImageGridProps = {
  imageUrls: string[];
  variant?: "grid" | "feature";
};

export function AnnouncementImageGrid({
  imageUrls,
  variant = "grid",
}: AnnouncementImageGridProps) {
  if (imageUrls.length === 0) {
    return null;
  }

  if (variant === "feature") {
    return (
      <div className="mt-4 space-y-2">
        {imageUrls.map((url, index) => (
        <a
            className="group block overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_28px_-24px_rgba(31,58,95,0.42)]"
            href={url}
            key={url}
            rel="noreferrer"
            target="_blank"
          >
            <Image
              alt={`Announcement attachment ${index + 1}`}
              className="aspect-[16/10] w-full object-cover transition-transform group-hover:scale-[1.02]"
              height={800}
              src={url}
              width={1280}
            />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-3">
      {imageUrls.map((url, index) => (
        <a
          className="group block overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_24px_-22px_rgba(31,58,95,0.42)]"
          href={url}
          key={url}
          rel="noreferrer"
          target="_blank"
        >
          <Image
            alt={`Announcement attachment ${index + 1}`}
            className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02] sm:aspect-[4/3]"
            height={900}
            src={url}
            width={1200}
          />
        </a>
      ))}
    </div>
  );
}
