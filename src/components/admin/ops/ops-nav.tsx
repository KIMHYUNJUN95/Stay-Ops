"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";

/**
 * 판매 캘린더의 이동(건물 · 30일/월간 · 앞뒤 · 오늘 · 취소 보기) — **누르는 순간 반응한다**(2026-09-30 속도).
 *
 * 이동은 서버에서 달력을 다시 만들어 오므로 1초 남짓 걸린다. 그동안 화면이 그대로면 「안 눌렸나?」
 * 싶어 또 누른다. 누른 링크에 로딩 점을 띄우고, 격자를 살짝 흐려 「불러오는 중」임을 보인다.
 * Next 의 `useLinkStatus` 로 **그 링크의** 대기 상태를 읽는다 — 전역 상태를 따로 두지 않는다.
 */
const NavPendingContext = createContext<(delta: number) => void>(() => undefined);

export function OpsNavScope({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);
  const bump = useCallback((delta: number) => setPending((value) => Math.max(0, value + delta)), []);
  return (
    <NavPendingContext.Provider value={bump}>
      <div aria-busy={pending > 0} className={`ops${pending > 0 ? " is-nav" : ""}`}>
        {children}
      </div>
    </NavPendingContext.Provider>
  );
}

function PendingMark() {
  const { pending } = useLinkStatus();
  const bump = useContext(NavPendingContext);
  useEffect(() => {
    if (!pending) return;
    bump(1);
    return () => bump(-1);
  }, [bump, pending]);
  return pending ? <span aria-hidden="true" className="ops__navspin" /> : null;
}

/** `title` · `aria-*` · `onClick` 같은 속성은 그대로 `<Link>` 로 넘긴다(건물 탭의 힌트·Ctrl+클릭). */
type OpsNavLinkProps = Omit<ComponentProps<typeof Link>, "href" | "children"> & {
  children: ReactNode;
  href: string;
};

export function OpsNavLink({ children, href, ...rest }: OpsNavLinkProps) {
  return (
    <Link {...rest} href={href}>
      {children}
      <PendingMark />
    </Link>
  );
}

/**
 * 링크가 아닌 곳(건물 탭의 체크 동그라미 · Ctrl/⌘+클릭)에서 이동할 때도 **같은 대기 표시**를 쓴다.
 *
 * `router.push` 를 전환(transition)으로 감싸면 새 화면이 올 때까지 `pending` 이 참이다 — 그동안 격자를
 * 흐리게 하고 위쪽 막대를 돌린다(`OpsNavScope`). 어느 버튼이 눌렸는지는 부르는 쪽이 들고 있다.
 */
export function useOpsNavigate() {
  const router = useRouter();
  const bump = useContext(NavPendingContext);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!pending) return;
    bump(1);
    return () => bump(-1);
  }, [bump, pending]);
  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );
  return { navigate, pending };
}
