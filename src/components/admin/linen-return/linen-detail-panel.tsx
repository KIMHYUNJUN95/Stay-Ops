"use client";

// Admin 린넨 반품 콘솔 — 우측 상세 패널. 읽기 모드와 수정 모드를 한 패널에서 전환한다.
//
// 읽기: 기록 정보(등록 일시 · 등록자 · 건물) + 전체 품목/수량 + 총수량 + 메모 + 사진.
// 수정: 건물 · 품목/수량 · 메모 · 사진만 편집한다. 등록 일시/등록자는 현장 증빙값이라
//       읽기 전용 `.rofield` 로 잠가 두고, 서버 액션도 이 두 컬럼을 payload 에 넣지 않는다.
// 사진은 기존 업로드 계약(compressImageFile → uploadRequestImages, 기능당 5장)을 그대로 쓴다.
// See docs/product/19-linen-defect-workflow.md → "Record Management Contract".

import { useRef, useState } from "react";
import {
  Building2,
  Camera,
  Check,
  ChevronDown,
  Clock,
  ImageIcon,
  Layers,
  Lock,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import {
  compressImageFile,
  type PreviewItem,
} from "@/components/announcements/announcement-image-uploader";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import type {
  AdminLinenBuildingOption,
  AdminLinenItemOption,
  AdminLinenRecordVM,
} from "@/lib/admin-linen-returns";
import {
  dayOf,
  fmtDateLong,
  fmtDateTime,
  itemsForBuilding,
  timeOf,
  tpl,
} from "./linen-console-data";
import type { LinenCopy } from "./linen-record-list";

/** CLAUDE.md §8 — 기능당 5장(프로젝트 업무 예외는 해당 없음). 서버에서도 다시 막는다. */
export const MAX_PHOTOS = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/gif", "image/jpeg", "image/png", "image/webp"];

export type LinenEditPayload = {
  buildingName: string;
  lines: { itemId: string; quantity: number }[];
  note: string;
  photos: string[];
};

type DraftLine = { itemId: string; quantity: string };

type Draft = {
  building: string;
  lines: DraftLine[];
  note: string;
  photos: string[];
  pending: PreviewItem[];
};

type Props = {
  record: AdminLinenRecordVM;
  t: LinenCopy["console"];
  units: Pick<LinenCopy, "quantityUnit" | "kindsUnit">;
  errors: Record<string, string>;
  catalog: AdminLinenItemOption[];
  buildings: AdminLinenBuildingOption[];
  localeTag: string;
  organizationId: string;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: LinenEditPayload) => void;
  onDelete: () => void;
};

function draftFrom(record: AdminLinenRecordVM): Draft {
  return {
    building: record.buildingName,
    lines: record.lines.map((line) => ({ itemId: line.itemId, quantity: String(line.quantity) })),
    note: record.note ?? "",
    photos: [...record.photos],
    pending: [],
  };
}

export function LinenDetailPanel({
  record,
  t,
  units,
  errors,
  catalog,
  buildings,
  localeTag,
  organizationId,
  saving,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { disabled: saving });

  const editing = draft !== null;
  const busy = saving || uploading;
  const day = dayOf(record.registeredAt);
  const titleDate = `${fmtDateLong(day, localeTag)} ${timeOf(record.registeredAt)}`;

  // 건물 선택지 — 룸 마스터의 건물 + 이 기록의 건물(마스터에서 빠졌을 수 있다).
  // `value` 는 정규 건물명(서버 검증/저장 키), 표시만 현지화 라벨을 쓴다.
  const buildingChoices: AdminLinenBuildingOption[] = [
    ...(buildings.some((option) => option.name === record.buildingName)
      ? []
      : [{ name: record.buildingName, label: record.buildingLabel }]),
    ...buildings,
  ].filter((option) => Boolean(option.name));
  const buildingLabelOf = (name: string) =>
    buildingChoices.find((option) => option.name === name)?.label ?? name;

  // 수정 모드에서 고를 수 있는 품목 = 전역 품목 + 선택한 건물 전용 품목 (서버 검증과 같은 규칙).
  const selectable = draft ? itemsForBuilding(catalog, draft.building) : [];
  const usedItemIds = draft ? draft.lines.map((line) => line.itemId) : [];
  const duplicateIndexes = new Set(
    usedItemIds.map((id, index) => (id && usedItemIds.indexOf(id) !== index ? index : -1)),
  );
  const draftTotal = draft
    ? draft.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
    : 0;
  const photoCount = draft ? draft.photos.length + draft.pending.length : 0;

  function openEdit() {
    setDraft(draftFrom(record));
    setFormError(null);
  }

  function cancelEdit() {
    for (const item of draft?.pending ?? []) URL.revokeObjectURL(item.previewUrl);
    setDraft(null);
    setFormError(null);
  }

  function patch(next: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function addLine() {
    if (!draft) return;
    const free = selectable.find((item) => !usedItemIds.includes(item.id));
    if (!free) {
      setFormError(t.eAllItemsAdded);
      return;
    }
    setFormError(null);
    patch({ lines: [...draft.lines, { itemId: free.id, quantity: "1" }] });
  }

  function removeLine(index: number) {
    if (!draft || draft.lines.length <= 1) return;
    setFormError(null);
    patch({ lines: draft.lines.filter((_, i) => i !== index) });
  }

  function updateLine(index: number, next: Partial<DraftLine>) {
    if (!draft) return;
    setFormError(null);
    patch({ lines: draft.lines.map((line, i) => (i === index ? { ...line, ...next } : line)) });
  }

  /**
   * 건물을 바꾸면 그 건물에서 선택할 수 없는 품목 행(다른 건물 전용 품목)은 남길 수 없다 —
   * 서버가 invalid_item 으로 거절하므로 UI 에서 미리 정리한다.
   */
  function changeBuilding(building: string) {
    if (!draft) return;
    const allowed = new Set(itemsForBuilding(catalog, building).map((item) => item.id));
    const kept = draft.lines.filter((line) => allowed.has(line.itemId));
    setFormError(null);
    patch({ building, lines: kept.length > 0 ? kept : [{ itemId: "", quantity: "1" }] });
  }

  async function addPhotos(files: File[]) {
    if (!draft || files.length === 0 || busy) return;
    if (files.some((file) => !ALLOWED_TYPES.includes(file.type))) {
      setFormError(t.ePhotoType);
      return;
    }
    if (files.some((file) => file.size > MAX_BYTES)) {
      setFormError(tpl(t.ePhotoSize, { max: Math.round(MAX_BYTES / (1024 * 1024)) }));
      return;
    }
    if (photoCount + files.length > MAX_PHOTOS) {
      setFormError(tpl(t.ePhotoLimit, { max: MAX_PHOTOS }));
      return;
    }
    setFormError(null);
    const items: PreviewItem[] = await Promise.all(
      files.map(async (file) => {
        const compressed = await compressImageFile(file);
        return {
          id: `${Date.now()}-${Math.random()}`,
          file: compressed,
          previewUrl: URL.createObjectURL(compressed),
        };
      }),
    );
    setDraft((prev) => (prev ? { ...prev, pending: [...prev.pending, ...items] } : prev));
  }

  function removeExistingPhoto(url: string) {
    if (!draft) return;
    setFormError(null);
    patch({ photos: draft.photos.filter((value) => value !== url) });
  }

  function removePendingPhoto(id: string) {
    if (!draft) return;
    const item = draft.pending.find((value) => value.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    setFormError(null);
    patch({ pending: draft.pending.filter((value) => value.id !== id) });
  }

  async function submit() {
    if (!draft || busy) return;
    const ids = draft.lines.map((line) => line.itemId);
    if (ids.some((id) => !id)) {
      setFormError(errors.invalid_item);
      return;
    }
    if (ids.some((id, index) => ids.indexOf(id) !== index)) {
      setFormError(t.eDuplicate);
      return;
    }
    const lines = draft.lines.map((line) => ({
      itemId: line.itemId,
      quantity: Number(line.quantity),
    }));
    if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)) {
      setFormError(t.eQuantity);
      return;
    }

    let photos = draft.photos;
    if (draft.pending.length > 0) {
      setUploading(true);
      try {
        const { imageUrls } = await uploadRequestImages({
          items: draft.pending,
          organizationId,
          requestId: record.id,
          requestType: "linen-returns",
        });
        photos = [...draft.photos, ...imageUrls];
      } catch {
        setUploading(false);
        setFormError(errors.save_failed);
        return;
      }
      setUploading(false);
    }

    setFormError(null);
    onSave({ buildingName: draft.building, lines, note: draft.note, photos });
  }

  return (
    <>
      <div className="panel-scrim on" onClick={busy ? undefined : onClose} />
      <aside
        aria-label={t.pKicker}
        className="panel on"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">
              {editing ? t.pEditKicker : t.pKicker} · {record.shortId}
            </span>
            <button
              aria-label={t.close}
              className="panel__x"
              disabled={busy}
              onClick={editing ? cancelEdit : onClose}
              type="button"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="mpanel__title" style={{ marginTop: 11 }}>
            {titleDate}
          </div>
          <div className="mpanel__chips">
            {editing ? (
              <>
                <span className="cat">
                  <span className="ic">
                    <Pencil aria-hidden="true" />
                  </span>
                  {t.chipEditing}
                </span>
                <span className="cat">
                  <span className="ic">
                    <Building2 aria-hidden="true" />
                  </span>
                  {buildingLabelOf(draft.building)}
                </span>
              </>
            ) : (
              <>
                <span className="cat">
                  <span className="ic">
                    <Building2 aria-hidden="true" />
                  </span>
                  {record.buildingLabel}
                </span>
                <span className="cat">
                  {record.lines.length}
                  {units.kindsUnit}
                </span>
                <span className="cat">
                  <span className="ic">
                    <Layers aria-hidden="true" />
                  </span>
                  {record.totalQuantity}
                  {units.quantityUnit}
                </span>
                {record.photos.length ? (
                  <span className="phcount">
                    <span className="ic">
                      <Camera aria-hidden="true" />
                    </span>
                    {record.photos.length}
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="panel__body">
          {editing ? (
            <>
              {/* 현장 증빙값 — 수정 불가 */}
              <div className="pblock">
                <div className="pblock__t">{t.pEvidenceTitle}</div>
                <div className="rofield">
                  <span className="rofield__ic">
                    <span className="ic">
                      <Clock aria-hidden="true" />
                    </span>
                  </span>
                  <span className="rofield__b">
                    <span className="rofield__k">{t.pRegisteredAt}</span>
                    <span className="rofield__v mono">{fmtDateTime(record.registeredAt)}</span>
                  </span>
                  <span className="rofield__tag">
                    <span className="ic">
                      <Lock aria-hidden="true" />
                    </span>
                  </span>
                </div>
                <div className="rofield">
                  <span className="rofield__ic">
                    <span className="ic">
                      <User aria-hidden="true" />
                    </span>
                  </span>
                  <span className="rofield__b">
                    <span className="rofield__k">{t.pRegistrant}</span>
                    <span className="rofield__v">{record.registrantName || "—"}</span>
                  </span>
                  <span className="rofield__tag">
                    <span className="ic">
                      <Lock aria-hidden="true" />
                    </span>
                  </span>
                </div>
              </div>

              {/* 건물 */}
              <div className="pblock">
                <div className="pblock__t">{t.pBuilding}</div>
                <div className="fld">
                  <div className="selwrap">
                    <select
                      aria-label={t.pBuilding}
                      disabled={busy}
                      onChange={(event) => changeBuilding(event.target.value)}
                      value={draft.building}
                    >
                      {buildingChoices.map((option) => (
                        <option key={option.name} value={option.name}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="ic chev">
                      <ChevronDown aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </div>

              {/* 반품 품목 */}
              <div className="pblock">
                <div className="pblock__t">
                  {t.pItems} · {draft.lines.length}
                  {units.kindsUnit}
                </div>
                <div className="lehead">
                  <span>{t.fItem}</span>
                  <span>{t.fQty}</span>
                  <span />
                </div>
                <div className="lelines">
                  {draft.lines.map((line, index) => (
                    <div
                      className={`leline${duplicateIndexes.has(index) ? " is-dup" : ""}`}
                      key={`${line.itemId}-${index}`}
                    >
                      <div className="fld">
                        <div className="selwrap">
                          <select
                            aria-label={t.fItem}
                            disabled={busy}
                            onChange={(event) => updateLine(index, { itemId: event.target.value })}
                            value={line.itemId}
                          >
                            {line.itemId ? null : <option value="" />}
                            {selectable.map((item) => {
                              const taken = usedItemIds.includes(item.id) && line.itemId !== item.id;
                              return (
                                <option disabled={taken} key={item.id} value={item.id}>
                                  {item.name}
                                  {taken ? ` — ${t.fAlreadyAdded}` : ""}
                                </option>
                              );
                            })}
                          </select>
                          <span className="ic chev">
                            <ChevronDown aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                      <div className="fld">
                        <input
                          aria-label={t.fQty}
                          disabled={busy}
                          inputMode="numeric"
                          min={1}
                          onChange={(event) =>
                            updateLine(index, { quantity: event.target.value.replace(/[^\d]/g, "") })
                          }
                          step={1}
                          type="number"
                          value={line.quantity}
                        />
                      </div>
                      <button
                        className="leline__del"
                        disabled={busy || draft.lines.length <= 1}
                        onClick={() => removeLine(index)}
                        title={t.fRemoveLine}
                        type="button"
                      >
                        <span className="ic">
                          <Trash2 aria-hidden="true" />
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                {formError ? (
                  <div className="lerr">
                    <span className="ic">
                      <TriangleAlert aria-hidden="true" />
                    </span>
                    {formError}
                  </div>
                ) : null}
                <button
                  className={`phadd${busy ? " is-disabled" : ""}`}
                  disabled={busy}
                  onClick={addLine}
                  style={{ marginTop: 9 }}
                  type="button"
                >
                  <span className="ic">
                    <Plus aria-hidden="true" />
                  </span>
                  {t.fAddItem}
                </button>
                <div className="ltotal">
                  <span className="ltotal__k">{t.pTotal}</span>
                  <span className="ltotal__v">
                    {draftTotal}
                    <span className="u">{units.quantityUnit}</span>
                  </span>
                </div>
              </div>

              {/* 메모 */}
              <div className="pblock">
                <div className="pblock__t">{t.pMemo}</div>
                <div className="fld">
                  <textarea
                    disabled={busy}
                    onChange={(event) => patch({ note: event.target.value })}
                    placeholder={t.fMemoPlaceholder}
                    value={draft.note}
                  />
                </div>
              </div>

              {/* 사진 */}
              <div className="pblock">
                <div className="pblock__t">
                  {photoCount ? `${t.pPhotos} · ${photoCount}` : t.pPhotos}
                </div>
                {photoCount ? (
                  <div className="pgal">
                    {draft.photos.map((url) => (
                      <div className="pshot" key={url}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" src={url} />
                        <button
                          className="pshot__x"
                          disabled={busy}
                          onClick={() => removeExistingPhoto(url)}
                          title={t.fRemovePhoto}
                          type="button"
                        >
                          <span className="ic">
                            <X aria-hidden="true" />
                          </span>
                        </button>
                      </div>
                    ))}
                    {draft.pending.map((item) => (
                      <div className="pshot" key={item.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" src={item.previewUrl} />
                        <button
                          className="pshot__x"
                          disabled={busy}
                          onClick={() => removePendingPhoto(item.id)}
                          title={t.fRemovePhoto}
                          type="button"
                        >
                          <span className="ic">
                            <X aria-hidden="true" />
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <input
                  accept={ALLOWED_TYPES.join(",")}
                  hidden
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    void addPhotos(files);
                  }}
                  ref={fileRef}
                  type="file"
                />
                <button
                  className={`phadd${busy || photoCount >= MAX_PHOTOS ? " is-disabled" : ""}`}
                  disabled={busy || photoCount >= MAX_PHOTOS}
                  onClick={() => fileRef.current?.click()}
                  style={{ marginTop: photoCount ? 9 : 0 }}
                  type="button"
                >
                  <span className="ic">
                    <Camera aria-hidden="true" />
                  </span>
                  {uploading ? t.uploading : t.fAddPhoto}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 기록 정보 */}
              <div className="pblock">
                <div className="pblock__t">{t.pRecordInfo}</div>
                <div className="kv">
                  <span className="kv__k">{t.pRegisteredAt}</span>
                  <span className="kv__v mono">{fmtDateTime(record.registeredAt)}</span>
                </div>
                <div className="kv">
                  <span className="kv__k">{t.pRegistrant}</span>
                  <span className="kv__v">{record.registrantName || "—"}</span>
                </div>
                <div className="kv">
                  <span className="kv__k">{t.pBuilding}</span>
                  <span className="kv__v">{record.buildingLabel}</span>
                </div>
                <div className="dimnote" style={{ marginTop: 11 }}>
                  <span className="ic">
                    <Lock aria-hidden="true" />
                  </span>
                  {t.pEvidenceLock}
                </div>
              </div>

              {/* 반품 품목 */}
              <div className="pblock">
                <div className="pblock__t">
                  {t.pItems} · {record.lines.length}
                  {units.kindsUnit}
                </div>
                <div className="litems">
                  {record.lines.map((line) => (
                    <div className="litem" key={line.itemId}>
                      <span className="litem__nm">{line.name}</span>
                      <span className="litem__qty">
                        {line.quantity}
                        <span className="u">{units.quantityUnit}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="ltotal">
                  <span className="ltotal__k">{t.pTotal}</span>
                  <span className="ltotal__v">
                    {record.totalQuantity}
                    <span className="u">{units.quantityUnit}</span>
                  </span>
                </div>
              </div>

              {record.note ? (
                <div className="pblock">
                  <div className="pblock__t">{t.pMemo}</div>
                  <div className="mdesc">{record.note}</div>
                </div>
              ) : null}

              <div className="pblock">
                <div className="pblock__t">
                  {record.photos.length ? `${t.pPhotos} · ${record.photos.length}` : t.pPhotos}
                </div>
                {record.photos.length ? (
                  <div className="pgal">
                    {record.photos.map((url) => (
                      <a className="pshot" href={url} key={url} rel="noreferrer" target="_blank">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" src={url} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="pnophoto">
                    <span className="ic">
                      <ImageIcon aria-hidden="true" />
                    </span>
                    {t.noPhoto}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="panel__foot">
          {editing ? (
            <>
              <button className="btn btn--ghost" disabled={busy} onClick={cancelEdit} type="button">
                {t.cancel}
              </button>
              <span style={{ flex: 1 }} />
              <button className="btn btn--pri" disabled={busy} onClick={submit} type="button">
                <span className="ic">
                  <Check aria-hidden="true" />
                </span>
                {t.save}
              </button>
            </>
          ) : record.canManage ? (
            <>
              <button className="btn btn--ghost" disabled={busy} onClick={onDelete} type="button">
                <span className="ic">
                  <Trash2 aria-hidden="true" />
                </span>
                {t.delete}
              </button>
              <span style={{ flex: 1 }} />
              <button className="btn btn--pri" disabled={busy} onClick={openEdit} type="button">
                <span className="ic">
                  <Pencil aria-hidden="true" />
                </span>
                {t.edit}
              </button>
            </>
          ) : (
            <>
              <span className="modal__foot-note">
                <span className="ic">
                  <Lock aria-hidden="true" />
                </span>
                {t.readonlyNote}
              </span>
              <span style={{ flex: 1 }} />
              <button className="btn btn--ghost" onClick={onClose} type="button">
                {t.close}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
