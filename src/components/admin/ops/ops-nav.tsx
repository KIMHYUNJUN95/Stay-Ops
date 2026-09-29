"use client";

import Link, { useLinkStatus } from "next/link";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

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

export function OpsNavLink({ children, className, href }: { children: ReactNode; className?: string; href: string }) {
  return (
    <Link className={className} href={href}>
      {children}
      <PendingMark />
    </Link>
  );
}
