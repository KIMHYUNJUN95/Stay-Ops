"use client";

import { useCallback, useState } from "react";
import { CalendarCheck2, Home } from "lucide-react";
import { BottomSheet } from "@/components/shell/bottom-sheet";

export type HomeReservationItem = {
  id: string;
  guestName: string;
  place: string;
  source: string;
};

type Props = {
  checkInLabel: string;
  checkOutLabel: string;
  checkIns: HomeReservationItem[];
  checkOuts: HomeReservationItem[];
  emptyCheckIn: string;
  emptyCheckOut: string;
  guestFallback: string;
};

type SheetKind = "in" | "out";

export function HomeCheckInOut({
  checkInLabel,
  checkOutLabel,
  checkIns,
  checkOuts,
  emptyCheckIn,
  emptyCheckOut,
  guestFallback,
}: Props) {
  const [kind, setKind] = useState<SheetKind>("in");
  const [open, setOpen] = useState(false);

  const openSheet = useCallback((next: SheetKind) => {
    setKind(next);
    setOpen(true);
  }, []);

  const items = kind === "out" ? checkOuts : checkIns;
  const title = kind === "out" ? checkOutLabel : checkInLabel;
  const emptyText = kind === "out" ? emptyCheckOut : emptyCheckIn;

  return (
    <>
      <div className="hm__stats">
        <button className="hm__stat" onClick={() => openSheet("in")} type="button">
          <span className="hm__stat-ic">
            <CalendarCheck2 aria-hidden="true" />
          </span>
          <div className="hm__stat-v">{checkIns.length}</div>
          <div className="hm__stat-k">{checkInLabel}</div>
        </button>
        <button className="hm__stat" onClick={() => openSheet("out")} type="button">
          <span className="hm__stat-ic hm__stat-ic--alt">
            <Home aria-hidden="true" />
          </span>
          <div className="hm__stat-v">{checkOuts.length}</div>
          <div className="hm__stat-k">{checkOutLabel}</div>
        </button>
      </div>

      {open ? (
        <BottomSheet
          ariaLabel={title}
          header={
            <div className="hm">
              <div className="hm__cio-head">
                <span className="hm__cio-ic">
                  {kind === "out" ? (
                    <Home aria-hidden="true" />
                  ) : (
                    <CalendarCheck2 aria-hidden="true" />
                  )}
                </span>
                <span className="hm__cio-title">{title}</span>
                <span className="hm__cio-count">{items.length}</span>
              </div>
            </div>
          }
          onClose={() => setOpen(false)}
        >
          <div className="hm">
            {items.length === 0 ? (
              <div className="hm__cio-empty">{emptyText}</div>
            ) : (
              <div className="hm__cio-list">
                {items.map((item) => (
                  <div className="hm__cio-row" key={item.id}>
                    <div className="hm__cio-b">
                      <div className="hm__cio-g">{item.guestName || guestFallback}</div>
                      {item.place ? <div className="hm__cio-p">{item.place}</div> : null}
                    </div>
                    {item.source ? <span className="hm__cio-src">{item.source}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}
