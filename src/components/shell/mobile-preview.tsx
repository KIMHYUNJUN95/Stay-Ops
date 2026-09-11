"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BatteryFull, Wifi, X } from "lucide-react";

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
/** 상태바 — 시계·아일랜드·신호가 놓인다. 실제 기기와 같은 높이. */
const STATUS_H = 54;
/** 홈 인디케이터 띠. */
const HOME_H = 24;
/** 베젤 두께. */
const BEZEL = 13;

/**
 * 상태바·홈 인디케이터는 **화면 안**에 있다(실제 기기와 같다). 앱은 그 사이를 쓴다.
 *
 * 화면 위에 겹치지 않는 이유는 파일 상단 주석 참고 — iframe 안에서는 safe-area-inset 이 0 이라
 * 겹치면 앱 헤더·탭바와 부딪힌다.
 */
const APP_H = SCREEN_H - STATUS_H - HOME_H;

const FRAME_W = SCREEN_W + BEZEL * 2;
const FRAME_H = SCREEN_H + BEZEL * 2;

/** 위아래 여백 48px 을 남기고 들어갈 만큼만. 키우지는 않는다 — 확대하면 글자가 뭉갠다. */
function fitScale(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(1, (window.innerHeight - 48) / FRAME_H);
}

/** 상태바 시계. 실제 기기처럼 지금 시각을 보여 준다 — 고정값이면 그 자리만 가짜로 보인다. */
function clockText(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

export type MobilePreviewLabels = {
  title: string;
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
  const [clock, setClock] = useState(clockText);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // 분이 바뀌는 것만 보이면 되므로 20초면 충분하다.
    const timer = setInterval(() => setClock(clockText()), 20_000);
    return () => clearInterval(timer);
  }, []);

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
            {/* 측면 버튼 — 몸체 윤곽만 잡아 준다. */}
            <span className="mprev__btn mprev__btn--silent" aria-hidden="true" />
            <span className="mprev__btn mprev__btn--volup" aria-hidden="true" />
            <span className="mprev__btn mprev__btn--voldown" aria-hidden="true" />
            <span className="mprev__btn mprev__btn--power" aria-hidden="true" />

            <div className="mprev__screen" style={{ width: SCREEN_W, height: SCREEN_H }}>
              <div className="mprev__status" style={{ height: STATUS_H }}>
                <span className="mprev__time">{clock}</span>
                <span className="mprev__island" aria-hidden="true" />
                <span className="mprev__ind" aria-hidden="true">
                  <svg viewBox="0 0 18 12" className="mprev__bars">
                    <rect x="0" y="8" width="3" height="4" rx="1" />
                    <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                    <rect x="10" y="3" width="3" height="9" rx="1" />
                    <rect x="15" y="0.5" width="3" height="11.5" rx="1" />
                  </svg>
                  <Wifi />
                  <BatteryFull />
                </span>
              </div>

              <iframe
                className="mprev__app"
                style={{ width: SCREEN_W, height: APP_H }}
                src={href}
                title={labels.title}
              />

              <div className="mprev__home" style={{ height: HOME_H }} aria-hidden="true">
                <span />
              </div>
            </div>
          </div>

          {/* 「새 탭에서 열기」는 두지 않는다 — 미리보기가 전체 화면보다 편하다는 것이 확인됐고
              (2026-09-11 사용자), 같은 목적지로 가는 길이 둘이면 하나는 안 쓰인다. */}
          <div className="mprev__bar">
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
