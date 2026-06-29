// 컴플레인 생성 폼에서만 쓰는 타입 정의.
// 실제 예약 피커 데이터는 src/lib/complaint-reservations.ts 에서 가져온다.
// See docs/product/25-complaint-workflow.md.

// 생성 폼 피커에서 지원하는 3-플랫폼 서브셋 (cx-platform의 ComplaintPlatform 중 일부)
export type PlatformKey = "airbnb" | "booking" | "direct";

export type LinkTarget = {
  plat: PlatformKey;
  place: string;
  guest: string;
  stay: string;
  reservationId?: string;
};
