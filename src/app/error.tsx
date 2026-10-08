"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback } from "react";
import { AppErrorScreen } from "@/components/app-error-screen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  // 서버 데이터 요청이 실패한 경우(오프라인 등)엔 reset 만으로는 같은 오류가 다시 난다 — 서버 데이터를 다시 받고 경계를 푼다.
  const retry = useCallback(() => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [reset, router]);

  return <AppErrorScreen error={error} onRetry={retry} source="error-boundary" />;
}
