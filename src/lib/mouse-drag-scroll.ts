/**
 * 가로로 넘기는 줄(칩 줄 등)을 **마우스로 끌어 넘기게** 한다 — 손가락으로는 원래 되지만 마우스는 브라우저가 끌기 스크롤을
 * 해 주지 않는다(관리자 「모바일 보기」 iframe · 데스크톱에서 연 모바일 화면, 2026-10-02 사용자 지적).
 *
 * - 마우스 왼쪽 버튼으로 누른 채 6px 넘게 움직이면 그 줄을 가로로 넘긴다(잡는 손 커서 — `is-panning`).
 * - 넘기고 뗀 자리의 click(칩 · 링크)은 막는다 — 끌었는데 그 칩이 눌리면 안 된다. 짧게 누르면 그대로 click.
 * - 링크 · 이미지의 기본 끌기(드래그 앤 드롭)는 막는다.
 * - 손가락 · 펜은 건드리지 않는다(브라우저 스크롤 그대로).
 *
 * 돌려주는 함수로 떼어 낸다.
 */
export function attachMouseDragScroll(element: HTMLElement): () => void {
  const SLOP = 6;
  let suppressClick = false;

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const startX = event.clientX;
    const origin = element.scrollLeft;
    let moved = false;
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX;
      if (!moved && Math.abs(dx) > SLOP) {
        moved = true;
        element.classList.add("is-panning");
      }
      if (moved) element.scrollLeft = origin - dx;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!moved) return;
      element.classList.remove("is-panning");
      // 뒤따르는 click 한 번만 막는다 — click 이 안 오면(줄 밖에서 뗌) 다음 틱에 푼다.
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const onClickCapture = (event: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const onDragStart = (event: DragEvent) => event.preventDefault();

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("click", onClickCapture, true);
  element.addEventListener("dragstart", onDragStart);
  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("click", onClickCapture, true);
    element.removeEventListener("dragstart", onDragStart);
  };
}
