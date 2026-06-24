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

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import {
  submitAttendanceScan,
  type AttendanceScanMode,
  type AttendanceScanResult,
} from "@/app/mobile/attendance/actions";
import { getDictionary, type Dictionary } from "@/lib/i18n";

type AttendanceCopy = Dictionary["attendance"];

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

export function AttendanceCapture({ mode = "in", locale }: { mode?: AttendanceScanMode; locale: string }) {
  const copy = getDictionary(locale).attendance;
  const router = useRouter();

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

  const gpsText =
    gpsStatus === "ok"
      ? copy.gpsOk
      : gpsStatus === "denied"
        ? copy.gpsDenied
        : gpsStatus === "unavailable"
          ? copy.gpsUnavailable
          : copy.gpsPending;

  const scanHint = cameraError
    ? copy.captureHintCamera
    : phase === "submitting"
      ? copy.captureHintSubmitting
      : copy.captureHintScan;

  return (
    <div className="att">
      <div className="caphead">
        <span className="capttl">{isOut ? copy.captureOutTitle : copy.captureInTitle}</span>
        <span className="capstep">{copy.captureStep}</span>
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
          <AIc>{AttIcon.refresh}</AIc>{copy.captureRetryCamera}
        </button>
      ) : null}

      <div className="methods">
        <div className="methodchip on">
          <span className="methodchip__ic">
            <AIc>{AttIcon.qr}</AIc>
          </span>
          <div className="methodchip__t">
            <b>{copy.methodGpsQr}</b>
            <span>{copy.methodQrAvailable}</span>
          </div>
        </div>
        <div className="methodchip ghost">
          <span className="methodchip__ic">
            <AIc>{AttIcon.wifi}</AIc>
          </span>
          <div className="methodchip__t">
            <b>{copy.methodWifi}</b>
            <span>{copy.methodWifiSoon}</span>
          </div>
        </div>
      </div>
      <Link href="/mobile/attendance/correction" className="breakbtn" style={{ marginTop: "14px" }}>
        <AIc>{AttIcon.edit}</AIc>{copy.captureNoQr}
      </Link>

      {phase === "result" && result ? (
        <BottomSheet
          ariaLabel={isOut ? copy.resultOutTitle : copy.resultInTitle}
          className="att att__result-sheet"
          onClose={onDismiss}
        >
          <ResultSheet result={result} isOut={isOut} onHome={goHome} onRetry={retry} copy={copy} />
        </BottomSheet>
      ) : null}
    </div>
  );
}

function ResultSheet({
  result,
  isOut,
  onHome,
  onRetry,
  copy,
}: {
  result: AttendanceScanResult;
  isOut: boolean;
  onHome: () => void;
  onRetry: () => void;
  copy: AttendanceCopy;
}) {
  if (result.ok) {
    return (
      <>
        <div className="rsheet__ic ic-ok">{AttIcon.checkc}</div>
        <h3 className="rsheet__t">{isOut ? copy.resultOutTitle : copy.resultInTitle}</h3>
        <p className="rsheet__s">
          {isOut ? copy.resultOutMessage : copy.resultInMessage}
        </p>
        <div className="recap">
          <div className="recap__r">
            <span className="recap__k">
              <AIc>{AttIcon.pin}</AIc>{copy.resultSiteLabel}
            </span>
            <span className="recap__v">{result.siteName}</span>
          </div>
          <div className="recap__r">
            <span className="recap__k">
              <AIc>{AttIcon.clock}</AIc>
              {isOut ? copy.resultOutTimeLabel : copy.resultInTimeLabel}
            </span>
            <span className="recap__v mono">{result.timeLabel}</span>
          </div>
          <div className="recap__r">
            <span className="recap__k">
              <AIc>{AttIcon.qr}</AIc>{copy.resultAuthLabel}
            </span>
            <span className="recap__v">
              <span className="chip c-method" style={{ padding: "3px 9px" }}>
                {copy.methodGpsQr}
              </span>
            </span>
          </div>
          <div className="recap__r">
            <span className="recap__k">{copy.resultSessionLabel}</span>
            <span className="recap__v">
              {isOut ? (
                <span className="chip" style={{ padding: "3px 9px" }}>
                  {copy.resultSessionDone}
                </span>
              ) : (
                <span className="chip c-open" style={{ padding: "3px 9px" }}>
                  <span className="d" />
                  {copy.resultSessionOpen}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onHome}>
            {copy.resultConfirm}
          </button>
        </div>
      </>
    );
  }

  if (result.reason === "radius") {
    return (
      <>
        <div className="rsheet__ic ic-warn">{AttIcon.pin}</div>
        <h3 className="rsheet__t">{copy.resultRadiusTitle}</h3>
        <p className="rsheet__s">{copy.resultRadiusSub}</p>
        <div className="failnote warn">
          <AIc>{AttIcon.warn}</AIc>
          <div style={{ flex: 1 }}>
            <b>{copy.resultRadiusDetail(result.siteName ?? copy.resultSiteFallback, result.radiusMeters ?? "—")}</b>
            <p>{copy.resultRadiusDistance(result.distanceMeters ?? "—")}</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--retry" onClick={onRetry}>
            <AIc>{AttIcon.refresh}</AIc>{copy.resultRetry}
          </button>
          <Link href="/mobile/attendance/correction" className="rbtn rbtn--ghost">
            <AIc>{AttIcon.edit}</AIc>{copy.resultCorrection}
          </Link>
        </div>
      </>
    );
  }

  if (result.reason === "gps") {
    return (
      <>
        <div className="rsheet__ic ic-fail">{AttIcon.gpsoff}</div>
        <h3 className="rsheet__t">{copy.resultGpsTitle}</h3>
        <p className="rsheet__s">{copy.resultGpsSub}</p>
        <div className="failnote">
          <AIc>{AttIcon.warn}</AIc>
          <div>
            <b>{copy.resultGpsDetail}</b>
            <p>{copy.resultGpsHint}</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onRetry}>
            <AIc>{AttIcon.refresh}</AIc>{copy.resultRetry}
          </button>
          <Link href="/mobile/attendance/correction" className="rbtn rbtn--ghost">
            <AIc>{AttIcon.edit}</AIc>{copy.resultCorrection}
          </Link>
        </div>
      </>
    );
  }

  if (result.reason === "qr") {
    return (
      <>
        <div className="rsheet__ic ic-fail">{AttIcon.qr}</div>
        <h3 className="rsheet__t">{copy.resultQrTitle}</h3>
        <p className="rsheet__s">{copy.resultQrSub}</p>
        <div className="failnote">
          <AIc>{AttIcon.warn}</AIc>
          <div>
            <b>{copy.resultQrDetail}</b>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onRetry}>
            <AIc>{AttIcon.refresh}</AIc>{copy.resultRetry}
          </button>
          <Link href="/mobile/attendance/correction" className="rbtn rbtn--ghost">
            <AIc>{AttIcon.edit}</AIc>{copy.resultCorrection}
          </Link>
        </div>
      </>
    );
  }

  if (result.reason === "open_session") {
    return (
      <>
        <div className="rsheet__ic ic-warn">{AttIcon.warn}</div>
        <h3 className="rsheet__t">{copy.resultOpenSessionTitle}</h3>
        <p className="rsheet__s">{copy.resultOpenSessionSub}</p>
        <div className="failnote warn">
          <AIc>{AttIcon.info}</AIc>
          <div>
            <b>{copy.resultOpenSessionHint}</b>
            <p>{copy.resultOpenSessionCanRetry}</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onHome}>
            {copy.resultHomeButton}
          </button>
        </div>
      </>
    );
  }

  if (result.reason === "no_session") {
    return (
      <>
        <div className="rsheet__ic ic-warn">{AttIcon.warn}</div>
        <h3 className="rsheet__t">{copy.resultNoSessionTitle}</h3>
        <p className="rsheet__s">{copy.resultNoSessionSub}</p>
        <div className="failnote warn">
          <AIc>{AttIcon.info}</AIc>
          <div>
            <b>{copy.resultNoSessionCheck}</b>
            <p>{copy.resultNoSessionHint}</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onHome}>
            {copy.resultHomeButton}
          </button>
          <Link href="/mobile/attendance/correction" className="rbtn rbtn--ghost">
            <AIc>{AttIcon.edit}</AIc>{copy.resultCorrection}
          </Link>
        </div>
      </>
    );
  }

  if (result.reason === "open_break") {
    return (
      <>
        <div className="rsheet__ic ic-warn">{AttIcon.warn}</div>
        <h3 className="rsheet__t">{copy.resultOpenBreakTitle}</h3>
        <p className="rsheet__s">{copy.resultOpenBreakSub}</p>
        <div className="failnote warn">
          <AIc>{AttIcon.info}</AIc>
          <div>
            <b>{copy.resultOpenBreakEndFirst}</b>
            <p>{copy.resultOpenBreakHint}</p>
          </div>
        </div>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onHome}>
            {copy.resultHomeButton}
          </button>
        </div>
      </>
    );
  }

  // error
  return (
    <>
      <div className="rsheet__ic ic-fail">{AttIcon.warn}</div>
      <h3 className="rsheet__t">{copy.resultGenericTitle}</h3>
      <p className="rsheet__s">{copy.resultGenericSub}</p>
      <div className="rbtns">
        <button type="button" className="rbtn rbtn--primary" onClick={onRetry}>
          <AIc>{AttIcon.refresh}</AIc>{copy.resultRetry}
        </button>
      </div>
    </>
  );
}
