"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  images: string[];
  startIndex: number;
  onClose: () => void;
}

type XY = { clientX: number; clientY: number };
function dist2(a: XY, b: XY) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function ImageLightbox({ images, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [swipeDx, setSwipeDx] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);

  // Touch tracking in a plain object ref — no re-render during gesture
  const touch = useRef({
    n: 0,
    x0: 0, y0: 0,
    tx0: 0, ty0: 0,
    d0: 0, s0: 1,
    swiping: false,
    dx: 0,
  });

  // State refs read by the native touchmove handler (avoids stale closures)
  const live = useRef({ scale: 1, tx: 0, ty: 0, index });
  live.current = { scale, tx, ty, index };

  // Body scroll lock + viewport 줌 방지
  // PWA에서 핀치줌 시 브라우저 레벨 뷰포트 줌이 함께 적용되는 문제를 방지한다.
  // 라이트박스 오픈 중: user-scalable=no 로 브라우저 줌을 막고, 우리 JS 줌만 동작.
  // 라이트박스 닫힐 때: initial-scale=1,maximum-scale=1 → 원복 순서로 뷰포트를 1x 로 강제 리셋.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const prevViewport = meta?.getAttribute("content") ?? "";
    if (meta) {
      meta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      );
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      if (meta) {
        // 먼저 scale=1 로 강제 리셋한 뒤 원래 설정 복원 — 뷰포트 확대 잔존 현상 제거
        meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1");
        requestAnimationFrame(() => {
          meta.setAttribute("content", prevViewport);
        });
      }
    };
  }, []);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && live.current.index > 0) go(live.current.index - 1);
      else if (e.key === "ArrowRight" && live.current.index < images.length - 1)
        go(live.current.index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [images.length, onClose]);

  // Non-passive touchmove — must be added via DOM API to call preventDefault
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const r = touch.current;
      const { scale } = live.current;
      if (e.touches.length === 2 && r.n >= 2) {
        const d = dist2(e.touches[0], e.touches[1]);
        setScale(Math.min(5, Math.max(1, r.s0 * (d / r.d0))));
      } else if (e.touches.length === 1 && r.n === 1) {
        const dx = e.touches[0].clientX - r.x0;
        const dy = e.touches[0].clientY - r.y0;
        if (scale > 1) {
          setTx(r.tx0 + dx);
          setTy(r.ty0 + dy);
        } else {
          r.dx = dx;
          r.swiping = true;
          setSwipeDx(dx);
        }
      }
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  });

  function go(i: number) {
    setIndex(i);
    setScale(1); setTx(0); setTy(0); setSwipeDx(0);
    touch.current.swiping = false;
    touch.current.dx = 0;
  }

  function onTouchStart(e: React.TouchEvent) {
    const r = touch.current;
    r.n = e.touches.length;
    if (r.n === 1) {
      r.x0 = e.touches[0].clientX;
      r.y0 = e.touches[0].clientY;
      r.tx0 = tx; r.ty0 = ty;
      r.swiping = false; r.dx = 0;
    } else if (r.n === 2) {
      r.d0 = dist2(e.touches[0], e.touches[1]);
      r.s0 = scale;
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const r = touch.current;
    r.n = e.touches.length;
    if (r.swiping) {
      if (r.dx < -60 && index < images.length - 1) go(index + 1);
      else if (r.dx > 60 && index > 0) go(index - 1);
      else setSwipeDx(0);
      r.swiping = false;
      r.dx = 0;
    }
    if (scale < 1) { setScale(1); setTx(0); setTy(0); }
  }

  // Image transform: zoom takes priority over swipe feedback
  const imgTransform =
    scale > 1
      ? `scale(${scale}) translate(${tx / scale}px, ${ty / scale}px)`
      : swipeDx !== 0
        ? `translateX(${swipeDx * 0.35}px)`
        : "none";
  const imgTransition =
    scale > 1 || touch.current.swiping ? "none" : "transform 0.22s cubic-bezier(.22,1,.36,1)";

  // SSR guard — document is undefined in Node.js during SSR
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cx-lb" role="dialog" aria-modal>
      {/* 카운터 */}
      {images.length > 1 && (
        <div className="cx-lb__counter">{index + 1} / {images.length}</div>
      )}
      {/* 닫기 */}
      <button className="cx-lb__close" onClick={onClose} aria-label="닫기">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      {/* 이미지 영역 (터치 수신) */}
      <div
        ref={wrapRef}
        className="cx-lb__wrap"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={images[index]}
          alt=""
          className="cx-lb__img"
          style={{ transform: imgTransform, transition: imgTransition }}
          draggable={false}
        />
      </div>
      {/* 닷 인디케이터 */}
      {images.length > 1 && (
        <div className="cx-lb__dots">
          {images.map((_, i) => (
            <button
              key={i}
              className={`cx-lb__dot${i === index ? " on" : ""}`}
              onClick={() => go(i)}
              aria-label={`사진 ${i + 1}`}
            />
          ))}
        </div>
      )}
      {/* 스크림 (이미지 밖 탭 → 닫기) */}
      <div className="cx-lb__scrim" onClick={onClose} />
    </div>,
    document.body,
  );
}
