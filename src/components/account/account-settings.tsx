"use client";

import { useState, type ReactNode } from "react";
import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccountTabKey = "profile" | "organization" | "security";

/**
 * 계정 화면의 설정 허브 셸 (2026-07-31, B안).
 *
 * 예전에는 프로필 폼 · 조직 카드 · 로그아웃 · 계정 삭제가 한 페이지에 세로로 쌓여 있어, 성격이 전혀
 * 다른 것들(자주 안 바꾸는 신원 / 읽기 전용 소속 / 되돌릴 수 없는 파괴적 동작)이 같은 무게로 보였다.
 * 좌측 서브내비로 갈라 **파괴적 동작이 실수로 눈에 띄지 않게** 하고, 앞으로 비밀번호·기기 같은 항목이
 * 붙을 자리를 만든다.
 *
 * 패널 내용은 **서버에서 만들어 children 으로 받는다** — 이 컴포넌트는 탭 전환만 담당한다.
 * 그래야 폼이 서버 액션을 그대로 쓰고, 세션 데이터를 클라이언트로 내려보내지 않는다.
 *
 * 탭 상태를 URL 이 아니라 로컬 state 로 두는 이유: 전환마다 서버 왕복이 생기면 입력 중이던 폼이
 * 날아간다. 대신 저장 후 서버가 `?saved=` 로 돌아오므로 그때는 프로필 탭이 기본으로 열린다.
 */
export function AccountSettings({
  labels,
  panels,
  /** 알림 배너 등 탭과 무관하게 항상 위에 떠야 하는 것(저장 완료·오류·프로필 미완성). */
  banners,
}: {
  labels: Record<AccountTabKey, string>;
  panels: Record<AccountTabKey, ReactNode>;
  banners?: ReactNode;
}) {
  const [tab, setTab] = useState<AccountTabKey>("profile");

  const items: { key: AccountTabKey; icon: typeof UserRound }[] = [
    { key: "profile", icon: UserRound },
    { key: "organization", icon: Building2 },
    { key: "security", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-5">
      {banners}

      {/* 좁은 화면(모바일 셸)에서는 서브내비가 위로 올라가 가로 스크롤 칩이 된다. */}
      <div className="grid gap-4 sm:grid-cols-[168px_minmax(0,1fr)] sm:gap-5">
        <nav
          aria-label={labels.profile}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {items.map(({ key, icon: Icon }) => (
            <button
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold transition-colors sm:w-full",
                tab === key
                  ? "bg-primary/[0.08] text-primary"
                  : "text-muted-foreground hover:bg-slate-100",
              )}
              key={key}
              onClick={() => setTab(key)}
              type="button"
            >
              <Icon className="size-[15px] shrink-0" aria-hidden="true" />
              {labels[key]}
            </button>
          ))}
        </nav>

        <div className="min-w-0">{panels[tab]}</div>
      </div>
    </div>
  );
}
