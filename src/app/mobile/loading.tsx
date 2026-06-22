/**
 * Shared loading skeleton for every /mobile/* route segment.
 *
 * Without this, navigating between mobile screens (RSC data fetch) showed a blank shell + layout
 * shift on arrival — non-native. This renders an ivory, scroll-free placeholder (top chrome row +
 * a few card skeletons) so transitions read as instant. Pure presentational; no shell chrome so it
 * never double-renders the header/tab bar that the destination page's MobileShell will draw.
 */
export default function MobileLoading() {
  return (
    <div className="flex h-svh flex-col bg-background px-5 pt-[calc(env(safe-area-inset-top)+22px)]">
      {/* Top chrome placeholder — menu / wordmark / profile. */}
      <div className="flex items-center justify-between" aria-hidden="true">
        <div className="size-[38px] animate-pulse rounded-full bg-muted" />
        <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
        <div className="size-[38px] animate-pulse rounded-full bg-muted" />
      </div>

      {/* Content card skeletons. */}
      <div className="mt-7 space-y-3" aria-hidden="true">
        <div className="h-28 animate-pulse rounded-2xl bg-muted/70" />
        <div className="h-20 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-20 animate-pulse rounded-2xl bg-muted/50" />
        <div className="h-20 animate-pulse rounded-2xl bg-muted/40" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
