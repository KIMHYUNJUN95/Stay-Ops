import Image from "next/image";
import Link from "next/link";

/**
 * Mobile 404 — branded, trilingual. Hit when a `/mobile/.../[id]` deep-links to a deleted/unknown
 * record (the detail loaders return null → notFound()), instead of a bare framework 404.
 * Uses the canonical PWA app icon (same as the splash screen) so the brand is consistent
 * across cold-launch and error surfaces.
 */
export default function MobileNotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-8 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center text-foreground">
      <Image
        alt="Stay Ops"
        className="rounded-[22px] shadow-[0_22px_50px_-26px_hsl(223_46%_32%/0.55)]"
        height={84}
        priority
        src="/icons/icon-192.png"
        width={84}
      />

      <h1 className="mt-7 text-[22px] font-black tracking-[-0.02em]">
        찾을 수 없어요
      </h1>

      <div className="mt-3 space-y-[3px] text-[13px] font-medium leading-relaxed text-muted-foreground">
        <p>삭제되었거나 존재하지 않는 항목이에요.</p>
        <p lang="ja">削除されたか、存在しない項目です。</p>
        <p lang="en">This item was deleted or doesn’t exist.</p>
      </div>

      <Link
        className="mt-8 inline-flex h-12 items-center rounded-full bg-primary px-8 text-[14px] font-extrabold text-primary-foreground shadow-[0_14px_28px_-12px_hsl(223_46%_32%/0.55)] transition-transform active:scale-[0.97]"
        href="/mobile"
      >
        홈으로 가기
      </Link>
    </main>
  );
}
