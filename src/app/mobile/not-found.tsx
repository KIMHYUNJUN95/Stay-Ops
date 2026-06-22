import Link from "next/link";

/**
 * Mobile 404 — branded, trilingual. Hit when a `/mobile/.../[id]` deep-links to a deleted/unknown
 * record (the detail loaders return null → notFound()), instead of a bare framework 404.
 */
export default function MobileNotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-8 text-center text-foreground">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-[linear-gradient(160deg,#36568f,#1a2c4f)] text-2xl font-black italic text-[#f7f4ee]">
        S
      </div>
      <h1 className="mt-2 text-[19px] font-black tracking-[-0.02em]">찾을 수 없어요</h1>
      <p className="text-[13.5px] font-medium leading-relaxed text-muted-foreground">
        삭제되었거나 존재하지 않는 항목이에요.
        <br />
        削除されたか、存在しない項目です。
        <br />
        This item was deleted or doesn’t exist.
      </p>
      <Link
        className="mt-4 h-11 rounded-full bg-primary px-6 text-[14px] font-extrabold leading-[44px] text-primary-foreground transition-transform active:scale-[0.97]"
        href="/mobile"
      >
        홈으로 · ホームへ · Go home
      </Link>
    </main>
  );
}
