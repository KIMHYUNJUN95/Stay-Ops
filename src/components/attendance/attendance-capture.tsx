"use client";

/**
 * Attendance capture — real GPS + QR clock-in / clock-out (Step 3).
 *
 * Preserves the finalized design (Section B of "Attendance Module v2.html"): the scan viewfinder, the
 * GPS+QR / Wi-Fi(준비중) method chips, and ONE result sheet. What changed is that it is now FUNCTIONAL:
 *   - in-app camera QR scan (jsQR over a live <video> frame loop)
 *   - device GPS (Geolocation API)
 *   - both are sent to `submitAttendanceScan` (all validation + attempt logging happen server-side)
 *   - the result sheet renders the REAL success summary or the matching failure (gps / radius / qr /
 *     already-clocked-in / no-open-session), and reuses the app's shared drag-down-to-dismiss sheet.
 *
 * `mode` = "in" (출근 인증) or "out" (퇴근 인증). Wi-Fi stays inactive (`준비중`).
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import {
  submitAttendanceScan,
  type AttendanceScanMode,
  type AttendanceScanResult,
} from "@/app/mobile/attendance/actions";

type Gps = { lat: number; lng: number; acc: number | null } | { error: "denied" | "unavailable" };
type Phase = "scanning" | "submitting" | "result";
type GpsStatus = "pending" | "ok" | "denied" | "unavailable";

function getGpsOnce(): Promise<Gps> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ error: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy ?? null }),
      (err) => resolve({ error: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  });
}

export function AttendanceCapture({ mode = "in" }: { mode?: AttendanceScanMode }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<AttendanceScanResult | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("pending");
  const [cameraError, setCameraError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const gpsRef = useRef<Gps | null>(null);
  const submittedRef = useRef(false);
  // Holds the latest scan tick so the rAF loop never references the callback before it is declared.
  const scanTickRef = useRef<() => void>(() => {});

  const isOut = mode === "out";

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const submit = useCallback(
    async (token: string | null) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      stopCamera();
      setPhase("submitting");
      let g = gpsRef.current;
      if (!g) {
        g = await getGpsOnce();
        gpsRef.current = g;
      }
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
      const res = await submitAttendanceScan(
        "lat" in g
          ? { mode, token, latitude: g.lat, longitude: g.lng, accuracy: g.acc, gpsError: null, userAgent }
          : { mode, token, latitude: null, longitude: null, accuracy: null, gpsError: g.error, userAgent },
      );
      setResult(res);
      setPhase("result");
    },
    [mode, stopCamera],
  );

  const scanTick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      rafRef.current = requestAnimationFrame(() => scanTickRef.current());
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(() => scanTickRef.current());
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
    if (code && code.data) {
      void submit(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(() => scanTickRef.current());
  }, [submit]);

  // Keep the rAF loop pointed at the latest scanTick.
  useEffect(() => {
    scanTickRef.current = scanTick;
  }, [scanTick]);

  const startScanning = useCallback(async () => {
    // Initial state is already pending/no-error; retry() resets them in an event handler. No
    // synchronous setState here keeps this safe to call from the mount effect.
    // GPS runs in parallel; it updates the chip and is cached for submit.
    void getGpsOnce().then((g) => {
      gpsRef.current = g;
      setGpsStatus("lat" in g ? "ok" : g.error);
    });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      rafRef.current = requestAnimationFrame(() => scanTickRef.current());
    } catch {
      setCameraError(true);
    }
  }, []);

  useEffect(() => {
    if (phase !== "scanning") return;
    submittedRef.current = false;
    // Start the camera/GPS on the next tick (after paint) — keeps any state updates out of the
    // synchronous effect commit.
    const id = window.setTimeout(() => void startScanning(), 0);
    return () => {
      window.clearTimeout(id);
      stopCamera();
    };
  }, [phase, startScanning, stopCamera]);

  const goHome = useCallback(() => router.push("/mobile/attendance"), [router]);
  const retry = useCallback(() => {
    setCameraError(false);
    setGpsStatus("pending");
    setResult(null);
    setPhase("scanning");
  }, []);
  const retryCamera = useCallback(() => {
    setCameraError(false);
    setGpsStatus("pending");
    void startScanning();
  }, [startScanning]);

  const onDismiss = result?.ok ? goHome : retry;
  const drag = useSheetDragDismiss({ shown: phase === "result", onDismiss });

  const gpsText =
    gpsStatus === "ok"
      ? "위치 확인됨"
      : gpsStatus === "denied"
        ? "위치 권한 꺼짐"
        : gpsStatus === "unavailable"
          ? "위치 확인 불가"
          : "위치 확인 중…";

  const scanHint = cameraError
    ? "카메라를 사용할 수 없어요"
    : phase === "submitting"
      ? "인증 중…"
      : "현장 QR 코드를 사각형 안에 맞춰주세요";

  return (
    <div className="att">
      <div className="caphead">
        <span className="capttl">{isOut ? "퇴근 인증" : "출근 인증"}</span>
        <span className="capstep">1 / 2 · QR 스캔</span>
      </div>

      <div className="scanview">
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "inherit",
          }}
        />
        <div className="gpschip">
          <AIc>{AttIcon.pin}</AIc>
          <span className="dot" />
          {gpsText}
        </div>
        <div className="scanframe">
          <span className="scancorner tl" />
          <span className="scancorner tr" />
          <span className="scancorner bl" />
          <span className="scancorner br" />
          <div className="scanline" />
        </div>
        <div className="scanhint">{scanHint}</div>
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {cameraError ? (
        <button type="button" className="breakbtn" style={{ marginTop: "12px" }} onClick={retryCamera}>
          <AIc>{AttIcon.refresh}</AIc>카메라 다시 시도
        </button>
      ) : null}

      <div className="methods">
        <div className="methodchip on">
          <span className="methodchip__ic">
            <AIc>{AttIcon.qr}</AIc>
          </span>
          <div className="methodchip__t">
            <b>GPS + QR</b>
            <span>사용 가능</span>
          </div>
        </div>
        <div className="methodchip ghost">
          <span className="methodchip__ic">
            <AIc>{AttIcon.wifi}</AIc>
          </span>
          <div className="methodchip__t">
            <b>Wi-Fi</b>
            <span>준비중</span>
          </div>
        </div>
      </div>
      <Link href="/mobile/attendance/correction" className="breakbtn" style={{ marginTop: "14px" }}>
        <AIc>{AttIcon.edit}</AIc>QR이 없나요? 정정 요청
      </Link>

      {hydrated && phase === "result" && result
        ? createPortal(
            <div className="att">
              <div className="dim show" style={drag.scrimStyle} onClick={onDismiss} aria-hidden="true" />
              <div className="rsheet" data-sheet role="dialog" aria-modal="true" style={drag.sheetStyle}>
                <div {...drag.handleProps}>
                  <div className="rsheet__handle" />
                </div>
                <ResultSheet result={result} isOut={isOut} onHome={goHome} onRetry={retry} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ResultSheet({
  result,
  isOut,
  onHome,
  onRetry,
}: {
  result: AttendanceScanResult;
  isOut: boolean;
  onHome: () => void;
  onRetry: () => void;
}) {
  if (result.ok) {
    return (
      <>
        <div className="rsheet__ic ic-ok">{AttIcon.checkc}</div>
        <h3 className="rsheet__t">{isOut ? "퇴근 완료" : "출근 완료"}</h3>
        <p className="rsheet__s">
          {isOut ? "정상적으로 퇴근 처리되었어요" : "정상적으로 출근 처리되었어요"}
        </p>
        <div className="recap">
          <div className="recap__r">
            <span className="recap__k">
              <AIc>{AttIcon.pin}</AIc>장소
            </span>
            <span className="recap__v">{result.siteName}</span>
          </div>
          <div className="recap__r">
            <span className="recap__k">
              <AIc>{AttIcon.clock}</AIc>
              {isOut ? "퇴근 시각" : "출근 시각"}
            </span>
            <span className="recap__v mono">{result.timeLabel}</span>
          </div>
          <div className="recap__r">
            <span className="recap__k">
              <AIc>{AttIcon.qr}</AIc>인증
            </span>
            <span className="recap__v">
              <span className="chip c-method" style={{ padding: "3px 9px" }}>
                GPS+QR
              </span>
            </span>
          </div>
          <div className="recap__r">
            <span className="recap__k">세션</span>
            <span className="recap__v">
              {isOut ? (
                <span className="chip" style={{ padding: "3px 9px" }}>
                  완료
                </span>
              ) : (
                <span className="chip c-open" style={{ padding: "3px 9px" }}>
                  <span className="d" />
                  진행 중
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onHome}>
            확인
          </button>
        </div>
      </>
    );
  }

  if (result.reason === "radius") {
    return (
      <>
        <div className="rsheet__ic ic-warn">{AttIcon.pin}</div>
        <h3 className="rsheet__t">허용 범위 밖이에요</h3>
        <p className="rsheet__s">현장 반경 안에서 다시 시도해 주세요</p>
        <div className="failnote warn">
          <AIc>{AttIcon.warn}</AIc>
          <div style={{ flex: 1 }}>
            <b>
              {result.siteName ?? "현장"} 반경 {result.radiusMeters ?? "—"}m를 벗어났습니다
            </b>
            <p>
              현재 위치가 현장에서 <b>약 {result.distanceMeters ?? "—"}m</b> 떨어져 있어요.
            </p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--retry" onClick={onRetry}>
            <AIc>{AttIcon.refresh}</AIc>다시 시도
          </button>
          <Link href="/mobile/attendance/correction" className="rbtn rbtn--ghost">
            <AIc>{AttIcon.edit}</AIc>정정 요청
          </Link>
        </div>
      </>
    );
  }

  if (result.reason === "gps") {
    return (
      <>
        <div className="rsheet__ic ic-fail">{AttIcon.gpsoff}</div>
        <h3 className="rsheet__t">위치 권한이 필요해요</h3>
        <p className="rsheet__s">GPS 권한이 꺼져 있어 인증할 수 없어요</p>
        <div className="failnote">
          <AIc>{AttIcon.warn}</AIc>
          <div>
            <b>위치 접근 권한 거부됨</b>
            <p>
              브라우저/기기 설정에서 위치 권한을 <b>허용</b>으로 변경한 뒤 다시 시도해 주세요.
            </p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onRetry}>
            <AIc>{AttIcon.refresh}</AIc>다시 시도
          </button>
          <Link href="/mobile/attendance/correction" className="rbtn rbtn--ghost">
            <AIc>{AttIcon.edit}</AIc>정정 요청
          </Link>
        </div>
      </>
    );
  }

  if (result.reason === "qr") {
    return (
      <>
        <div className="rsheet__ic ic-fail">{AttIcon.qr}</div>
        <h3 className="rsheet__t">QR을 인식할 수 없어요</h3>
        <p className="rsheet__s">유효하지 않거나 비활성화된 QR이에요</p>
        <div className="failnote">
          <AIc>{AttIcon.warn}</AIc>
          <div>
            <b>현장 QR을 다시 확인해 주세요</b>
            <p>현장에 부착된 QR이 맞는지 확인한 뒤 다시 스캔해 주세요.</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onRetry}>
            <AIc>{AttIcon.refresh}</AIc>다시 시도
          </button>
          <Link href="/mobile/attendance/correction" className="rbtn rbtn--ghost">
            <AIc>{AttIcon.edit}</AIc>정정 요청
          </Link>
        </div>
      </>
    );
  }

  if (result.reason === "open_session") {
    return (
      <>
        <div className="rsheet__ic ic-warn">{AttIcon.warn}</div>
        <h3 className="rsheet__t">이미 근무 중이에요</h3>
        <p className="rsheet__s">진행 중인 근무가 있어 새로 출근할 수 없어요</p>
        <div className="failnote warn">
          <AIc>{AttIcon.info}</AIc>
          <div>
            <b>먼저 퇴근해 주세요</b>
            <p>진행 중인 근무를 종료한 뒤 다시 출근할 수 있어요.</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onHome}>
            홈으로
          </button>
        </div>
      </>
    );
  }

  if (result.reason === "no_session") {
    return (
      <>
        <div className="rsheet__ic ic-warn">{AttIcon.warn}</div>
        <h3 className="rsheet__t">진행 중인 근무가 없어요</h3>
        <p className="rsheet__s">출근 기록이 없어 퇴근할 수 없어요</p>
        <div className="failnote warn">
          <AIc>{AttIcon.info}</AIc>
          <div>
            <b>출근 기록을 찾을 수 없어요</b>
            <p>출근 처리가 누락된 경우 정정 요청으로 등록해 주세요.</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onHome}>
            홈으로
          </button>
          <Link href="/mobile/attendance/correction" className="rbtn rbtn--ghost">
            <AIc>{AttIcon.edit}</AIc>정정 요청
          </Link>
        </div>
      </>
    );
  }

  if (result.reason === "open_break") {
    return (
      <>
        <div className="rsheet__ic ic-warn">{AttIcon.warn}</div>
        <h3 className="rsheet__t">휴게 종료 후 퇴근할 수 있어요</h3>
        <p className="rsheet__s">진행 중인 휴게가 있어 퇴근할 수 없어요</p>
        <div className="failnote warn">
          <AIc>{AttIcon.info}</AIc>
          <div>
            <b>휴게를 먼저 종료해 주세요</b>
            <p>홈 화면에서 휴게 종료 후 다시 퇴근을 진행해 주세요.</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onHome}>
            홈으로
          </button>
        </div>
      </>
    );
  }

  // error
  return (
    <>
      <div className="rsheet__ic ic-fail">{AttIcon.warn}</div>
      <h3 className="rsheet__t">처리 중 문제가 발생했어요</h3>
      <p className="rsheet__s">잠시 후 다시 시도해 주세요</p>
      <div className="rbtns">
        <button type="button" className="rbtn rbtn--primary" onClick={onRetry}>
          <AIc>{AttIcon.refresh}</AIc>다시 시도
        </button>
      </div>
    </>
  );
}
