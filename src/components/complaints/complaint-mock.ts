// See docs/product/25-complaint-workflow.md.

export type PlatformKey = "airbnb" | "booking" | "direct";

export type LinkTarget = {
  plat: PlatformKey;
  propertyName?: string;
  roomLabel?: string;
  place: string;
  guest: string;
  guestName?: string;
  stay: string;
  reservationId?: string;
};
