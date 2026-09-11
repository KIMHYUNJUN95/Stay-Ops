"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";

/**
 * 모바일 미리보기 — 어드민 콘솔 안에서 실제 모바일 앱을 아이폰 모양 프레임으로 본다.
 *
 * **iframe 으로 진짜 앱을 띄운다.** 모바일 화면을 따로 만들어 흉내 내면 그 순간 두 벌이 되고,
 * 실제 앱이 바뀌어도 미리보기는 안 바뀐다. 같은 오리진이라 세션 쿠키가 그대로 통해 로그인 상태로
 * 열린다.
 *
 * ## 다이내믹 아일랜드가 화면 위가 아니라 베젤에 있는 이유
 *
 * 실제 아이폰은 `safe-area-inset-top`(약 59px)이 있어 내용이 아일랜드를 피해 간다. **iframe 안에서는
 * 그 값이 0** 이라 앱 헤더와 겹친다. 겹치지 않게 하려면 모바일 셸에 여백을 주입해야 하는데, 그 셸은
 * 여러 화면이 공유하는 계약이라(CLAUDE.md §3) 미리보기 때문에 실제 앱 레이아웃을 건드릴 수 없다.
 *
 * 그래서 아일랜드·홈 인디케이터를 **프레임 쪽**에 두고 앱은 그 아래에서 시작한다. 조금 덜
 * 사실적이지만 겹침이 없고, 실제 앱 코드는 한 줄도 건드리지 않는다(2026-09-11 사용자 선택 — A안).
 */

/** 아이폰 15 의 논리 해상도. 기기 선택을 두지 않는다 — 고르는 게 늘면 미리보기가 도구가 된다. */
const SCREEN_W = 390;
const SCREEN_H = 844;
/** 아일랜드가 놓이는 상단 띠. 실제 기기의 상태바 자리와 비슷한 높이. */
const STATUS_H = 44;
/** 베젤 두께. */
const BEZEL = 12;

const FRAME_W = SCREEN_W + BEZEL * 2;
const FRAME_H = SCREEN_H + STATUS_H + BEZEL * 2 + 22; // 22 = 홈 인디케이터 띠

/** 위아래 여백 48px 을 남기고 들어갈 만큼만. 키우지는 않는다 — 확대하면 글자가 뭉갠다. */
function fitScale(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(1, (window.innerHeight - 48) / FRAME_H);
}

export type MobilePreviewLabels = {
  title: string;
  openNewTab: string;
  close: string;
};

export function MobilePreview({
  href,
  labels,
  onClose,
}: {
  href: string;
  labels: MobilePreviewLabels;
  onClose: () => void;
}) {
  /**
   * 화면이 낮으면 프레임을 줄인다 — 노트북에서 844px 는 대개 안 들어간다.
   *
   * 첫 값을 렌더 중에 정한다. 이 컴포넌트는 **버튼을 누른 뒤에만** 그려지므로 그 시점에는 언제나
   * 브라우저다(서버 렌더에서는 `previewOpen` 이 false 라 아예 안 그려진다). 효과 안에서 setState
   * 를 부르면 첫 프레임이 100% 로 그려졌다가 줄어들어 한 번 튄다.
   */
  const [scale, setScale] = useState(fitScale);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // 뒤 화면이 같이 스크롤되면 미리보기가 떠다니는 것처럼 보인다.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // `.adm` 으로 감싼다. 포털은 `document.body` 로 나가는데 이 콘솔의 스타일과 토큰은 전부
  // `.adm` 아래로 스코프돼 있어(admin-console.css), 감싸지 않으면 **CSS 가 하나도 적용되지 않는다** —
  // 프레임도 배율도 없이 날것으로 그려진다. 같은 이유로 다른 포털(cleaning-live-card)도 그렇게 한다.
  return createPortal(
    <div className="adm">
      <div
        className="mprev"
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onClick={onClose}
      >
        <div
          className="mprev__stage"
          style={{ transform: `scale(${scale})` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mprev__frame" style={{ width: FRAME_W, height: FRAME_H }}>
            <div className="mprev__status" style={{ height: STATUS_H }}>
              <span className="mprev__island" aria-hidden="true" />
            </div>
            <iframe
              className="mprev__screen"
              style={{ width: SCREEN_W, height: SCREEN_H }}
              src={href}
              title={labels.title}
            />
            <div className="mprev__home" aria-hidden="true">
              <span />
            </div>
          </div>

          <div className="mprev__bar">
            <a className="mprev__act" href={href} target="_blank" rel="noreferrer">
              <span className="ic">
                <ExternalLink />
              </span>
              {labels.openNewTab}
            </a>
            <button ref={closeRef} type="button" className="mprev__act" onClick={onClose}>
              <span className="ic">
                <X />
              </span>
              {labels.close}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
