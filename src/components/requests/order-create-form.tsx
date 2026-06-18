"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ClipboardList,
  Plus,
  ShoppingCart,
  User,
  X,
} from "lucide-react";
import { createOrderRequest } from "@/app/mobile/orders/new/actions";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import type { PreviewItem } from "@/components/announcements/announcement-image-uploader";
import {
  OrderItemRow,
  type OrderLineItem,
  type OrderLinkDomain,
} from "@/components/requests/order-item-row";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import type { Dictionary } from "@/lib/i18n";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { cn } from "@/lib/utils";

type OrderCreateFormProps = {
  buildingLabels: Record<string, string>;
  buildings: string[];
  copy: Dictionary["mobile"]["orderForm"];
  imgCopy: Dictionary["requestImages"];
  organizationId: string;
  reporterName: string;
  shareError?: boolean;
  sharedUrl?: string | null;
};

const FIELD_CLASS =
  "flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 text-left text-sm font-bold text-slate-900 outline-none shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] transition-colors disabled:opacity-50";

const PANEL_CLASS =
  "flex flex-col gap-4 rounded-[24px] border border-slate-200/80 bg-surface p-4 shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)] backdrop-blur-none";

type Urgency = "normal" | "high";
type SharedBannerKind = "injected" | "error" | null;

function createItem(): OrderLineItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, link: "", memo: "", name: "", quantity: "1" };
}

function detectLinkDomain(value: string): OrderLinkDomain {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host === "amazon.co.jp" || host === "www.amazon.co.jp" || host === "amzn.asia") {
      return "amazon";
    }
    if ((host === "ikea.com" || host === "www.ikea.com") && path.startsWith("/jp")) {
      return "ikea";
    }
    return "other";
  } catch {
    return null;
  }
}

export function OrderCreateForm({
  buildingLabels,
  buildings,
  copy,
  imgCopy,
  organizationId,
  reporterName,
  shareError,
  sharedUrl,
}: OrderCreateFormProps) {
  const [items, setItems] = useState<OrderLineItem[]>(() => {
    const first = createItem();
    if (sharedUrl) {
      return [{ ...first, link: sharedUrl }];
    }
    return [first];
  });
  const [sharedBannerKind, setSharedBannerKind] = useState<SharedBannerKind>(
    sharedUrl ? "injected" : shareError ? "error" : null,
  );
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [reason, setReason] = useState("");
  const [building, setBuilding] = useState("");
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [itemErrors, setItemErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  /** 품목별 사진 목록 (itemId → PreviewItem[]) */
  const [itemPhotos, setItemPhotos] = useState<Record<string, PreviewItem[]>>({});

  const buildingRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (buildingRef.current && !buildingRef.current.contains(event.target as Node)) {
        setBuildingOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || "0"), 0),
    [items],
  );

  const linkDomains = useMemo(() => {
    const next: Record<string, OrderLinkDomain> = {};
    for (const item of items) {
      next[item.id] = detectLinkDomain(item.link);
    }
    return next;
  }, [items]);

  const updateItem = useCallback((id: string, patch: Partial<OrderLineItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    setItemErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setFormMessage(null);
  }, []);

  const addItem = useCallback(() => {
    setItems((current) => [...current, createItem()]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.id !== id)));
    setItemErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    // 삭제된 품목의 사진 blob URL 해제
    setItemPhotos((current) => {
      const photos = current[id] ?? [];
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const handlePhotosChange = useCallback((id: string, photos: PreviewItem[]) => {
    setItemPhotos((current) => ({ ...current, [id]: photos }));
  }, []);

  const pasteLink = useCallback(async (id: string) => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value) return;
      updateItem(id, { link: value.trim() });
    } catch {
      setFormMessage(copy.pasteUnavailable);
    }
  }, [copy.pasteUnavailable, updateItem]);

  function validateItems() {
    const nextErrors: Record<string, string[]> = {};
    for (const item of items) {
      const errors: string[] = [];
      if (!item.name.trim()) errors.push("name");
      if (!item.quantity.trim() || Number(item.quantity) <= 0) errors.push("quantity");
      if (errors.length > 0) nextErrors[item.id] = errors;
    }
    setItemErrors(nextErrors);
    return nextErrors;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);
    if (!building) {
      setFormMessage(copy.confirmMissing);
      return;
    }
    const nextErrors = validateItems();
    if (Object.keys(nextErrors).length > 0) {
      setFormMessage(copy.confirmMissing);
      return;
    }
    setConfirmOpen(true);
  }

  function handleConfirmSubmit() {
    const form = formRef.current;
    if (!form) return;
    const nextErrors = validateItems();
    if (!building || Object.keys(nextErrors).length > 0) {
      setConfirmOpen(false);
      setFormMessage(copy.confirmMissing);
      return;
    }

    const requestId = crypto.randomUUID();
    const formData = new FormData(form);
    formData.set("id", requestId);
    formData.set("buildingName", building);
    formData.set("urgency", urgency);
    formData.set("reason", reason);

    startTransition(async () => {
      // 품목별 사진 업로드 → URL을 item에 포함
      // 업로드 실패 시 제출 중단하고 사용자에게 에러 표시
      let itemsWithPhotos: typeof items;
      try {
        itemsWithPhotos = await Promise.all(
          items.map(async (item) => {
            const photos = itemPhotos[item.id] ?? [];
            if (photos.length === 0) return item;
            const { imageUrls } = await uploadRequestImages({
              items: photos,
              organizationId,
              requestId,
              requestType: "order-images",
            });
            return { ...item, imageUrls };
          }),
        );
      } catch {
        setConfirmOpen(false);
        setFormMessage(copy.imageUploadFailed);
        return;
      }
      formData.set("itemsJson", JSON.stringify(itemsWithPhotos));
      await createOrderRequest(formData);
    });
  }

  function renderConfirmSummary(count: number, total: number) {
    if (typeof copy.confirmSummary === "function") {
      return copy.confirmSummary(count, total);
    }
    return `${count} items \u00B7 total ${total}`;
  }

  return (
    <>
      <form className="flex flex-col gap-6" onSubmit={handleSubmit} ref={formRef}>
        {sharedBannerKind !== null ? (
          <div
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold",
              sharedBannerKind === "error"
                ? "border-orange-200 bg-orange-50 text-orange-800"
                : "border-[#C9D8E8] bg-[#EAF1F8] text-[#1F3A5F]",
            )}
          >
            <span>{sharedBannerKind === "error" ? copy.shareInvalidUrl : copy.shareInjected}</span>
            <button
              aria-label={copy.cancel}
              className="shrink-0 transition-colors"
              onClick={() => setSharedBannerKind(null)}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <section className={cn("relative flex flex-col gap-2", buildingOpen ? "z-30" : "z-10")}>
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
              {copy.summaryTitle}
            </h2>
            <div className="flex rounded-full border border-slate-200/80 bg-white/82 p-1 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)]">
              {(["normal", "high"] as const).map((tone) => (
                <button
                  aria-pressed={urgency === tone}
                  className={cn(
                    "min-h-9 rounded-full px-3 text-xs font-black transition-colors",
                    urgency === tone
                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80"
                      : "text-slate-500",
                  )}
                  key={tone}
                  onClick={() => setUrgency(tone)}
                  type="button"
                >
                  {tone === "normal" ? copy.urgencyNormal : copy.urgencyHigh}
                </button>
              ))}
            </div>
          </div>
          <div className={cn(PANEL_CLASS, "relative")}>
            <div className="flex flex-col gap-2" ref={buildingRef}>
              <span className="text-xs font-semibold text-muted-foreground">{copy.building}</span>
              <div className="relative">
                <button
                  className={cn(FIELD_CLASS, buildingOpen && "border-rose-300 ring-2 ring-rose-200/60")}
                  disabled={buildings.length === 0}
                  onClick={() => setBuildingOpen(!buildingOpen)}
                  type="button"
                >
                  <span className={cn("truncate", !building && "text-muted-foreground/70")}>
                    {building ? localizePropertyName(building, buildingLabels) : copy.buildingPlaceholder}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200"
                    style={{ transform: buildingOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>
                {buildingOpen && buildings.length > 0 ? (
                  <ul className="absolute left-0 z-50 mt-1.5 max-h-60 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-1 shadow-[0_18px_40px_-24px_rgba(31,58,95,0.55)]">
                    {buildings.map((b) => (
                      <li
                        className={cn(
                          "flex h-10 w-full cursor-pointer items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                          building === b
                            ? "bg-rose-50 text-rose-700"
                            : "text-slate-700 hover:bg-slate-50",
                        )}
                        key={b}
                        onClick={() => {
                          setBuilding(b);
                          setBuildingOpen(false);
                        }}
                      >
                        {localizePropertyName(b, buildingLabels)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{copy.reporter}</span>
              <div className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)]">
                <User className="size-4 text-[#315F91]" aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-foreground">{reporterName}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
              {copy.itemsTitle}
            </h2>
            <span className="rounded-full border border-slate-200/80 bg-white/82 px-2.5 py-1 text-xs font-black text-slate-500 shadow-[0_8px_18px_-18px_rgba(31,58,95,0.4)]">
              {renderConfirmSummary(items.length, totalQuantity)}
            </span>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <OrderItemRow
                canRemove={items.length > 1}
                copy={copy}
                domain={linkDomains[item.id]}
                errors={itemErrors[item.id] ?? []}
                imgCopy={imgCopy}
                index={index}
                item={item}
                key={item.id}
                onChange={updateItem}
                onPasteLink={pasteLink}
                onPhotosChange={handlePhotosChange}
                onRemove={removeItem}
                photos={itemPhotos[item.id] ?? []}
              />
            ))}
          </div>

          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-black text-rose-700 shadow-[0_12px_24px_-22px_rgba(31,58,95,0.45)] transition-colors hover:bg-rose-100/70 active:scale-[0.99]"
            onClick={addItem}
            type="button"
          >
            <Plus className="size-4" aria-hidden="true" />
            {copy.addItem}
          </button>
        </section>

        <section className="relative z-10 flex flex-col gap-2">
          <button
            className="inline-flex min-h-11 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 text-sm font-black text-slate-800 shadow-[0_12px_24px_-22px_rgba(31,58,95,0.45)]"
            onClick={() => setAdvancedOpen((open) => !open)}
            type="button"
          >
            {copy.advancedToggle}
            <span className="text-muted-foreground">{advancedOpen ? "-" : "+"}</span>
          </button>
          {advancedOpen ? (
            <div className={PANEL_CLASS}>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{copy.reason}</span>
                <textarea
                  className="min-h-24 w-full resize-none rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] transition-colors placeholder:text-slate-400 focus:border-rose-300 focus:ring-2 focus:ring-rose-200/60"
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={copy.reasonPlaceholder}
                  rows={4}
                  value={reason}
                />
              </label>
            </div>
          ) : null}
        </section>

        {formMessage ? <p className="pl-1 text-xs font-semibold text-destructive">{formMessage}</p> : null}

        <div className="mt-2 rounded-[24px] border border-slate-200/80 bg-white/90 p-2.5 shadow-[0_18px_34px_-26px_rgba(31,58,95,0.5)]">
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-[#315F91] px-3 text-sm font-black text-white shadow-[0_14px_26px_-18px_rgba(49,95,145,0.65)] transition-colors hover:bg-[#274D76] active:scale-[0.99] disabled:opacity-50"
            disabled={isPending}
            type="submit"
          >
            <ShoppingCart className="size-4" aria-hidden="true" />
            {copy.submit}
          </button>
        </div>
      </form>

      {confirmOpen ? (
        <BottomSheet
          ariaLabel={copy.confirmTitle}
          header={
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#315F91]">
                {copy.confirmReady}
              </p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-foreground">
                {copy.confirmTitle}
              </h3>
            </div>
          }
          onClose={() => setConfirmOpen(false)}
        >
          {({ close }) => (
            <>
              <div className="mt-3 rounded-2xl border border-border bg-background/55 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF1F8] text-[#315F91]">
                    <ClipboardList className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-base font-black text-foreground">
                      {renderConfirmSummary(items.length, totalQuantity)}
                    </p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {building ? localizePropertyName(building, buildingLabels) : copy.buildingPlaceholder}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background/70 text-sm font-bold text-foreground transition-colors hover:bg-muted/70"
                  onClick={close}
                  type="button"
                >
                  {copy.cancel}
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#315F91] text-sm font-black text-white transition-colors hover:bg-[#274D76] disabled:opacity-50"
                  disabled={isPending}
                  onClick={handleConfirmSubmit}
                  type="button"
                >
                  {copy.confirmSubmit}
                </button>
              </div>
            </>
          )}
        </BottomSheet>
      ) : null}
    </>
  );
}
