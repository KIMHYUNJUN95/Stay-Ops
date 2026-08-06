"use client";

// 외부 리뷰 상세 패널 오버레이 — 즉시 닫기 담당.
//
// 패널 자체는 서버 컴포넌트(ReviewDetailPanel)이고 존재 여부는 `?review=` 쿼리로 정해진다. 스크림/X를
// <Link>로만 닫으면 force-dynamic 페이지가 서버 왕복(데이터 재요청)을 끝낼 때까지 패널이 남아 "딜레이"로
// 느껴진다. 여기서는 서버 렌더된 패널을 children 슬롯으로 받아(=props 직렬화 없음, copy 함수 이슈 없음),
// 닫기 클릭을 이벤트 위임으로 가로채 즉시 CSS로 슬라이드아웃시키고 URL 동기화는 뒤에서 처리한다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  closeHref: string;
  children: React.ReactNode;
};

export function ReviewDetailOverlay({ closeHref, children }: Props) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setClosing(true);
        router.replace(closeHref, { scroll: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    // 스크림과 X 버튼(data-panel-close)만 닫기로 처리한다. 번역/전환 등 패널 내부 액션은 그대로 둔다.
    const target = event.target as HTMLElement;
    if (!target.closest("[data-panel-close]")) return;
    event.preventDefault();
    if (closing) return;
    setClosing(true);
    router.replace(closeHref, { scroll: false });
  }

  return (
    <div className={closing ? "rpanel-wrap is-closing" : "rpanel-wrap"} onClick={handleClick}>
      {children}
    </div>
  );
}
