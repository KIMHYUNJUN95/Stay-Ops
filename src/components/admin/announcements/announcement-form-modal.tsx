"use client";

// Admin 공지 관리 콘솔 — 새 공지 / 편집 폼 모달. 조직·제목·본문·이미지(≤5)·대상·상태·표시 옵션.
// 이미지는 제출 시 브라우저에서 Storage 로 직접 업로드(Server Action body 제한 우회) 후 URL 만 액션에 전달.
// Ported from the Claude Design handoff (announce-views.js → formModal).
// See docs/product/11-announcement-workflow.md → Composer / Edit Flow.
import { startTransition, useMemo, useRef, useState, useTransition } from "react";
import {
  Clock,
  Megaphone,
  Pin,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { AdmDropdown, type AdmOption } from "@/components/admin/shared/adm-dropdown";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import {
  cleanupAnnouncementImagePaths,
  saveAnnouncementConsole,
} from "@/app/admin/announcements/actions";
import { compressImageFile } from "@/components/announcements/announcement-image-uploader";
import { organizationRoles } from "@/config/roles";
import type { OrganizationRole } from "@/config/roles";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  AdminAnnouncementRoleCount,
  AdminAnnouncementVM,
} from "@/lib/admin-announcements";
import { AnnCopy, Ic, RoleLabel, tpl } from "./announcements-console-shared";

const BUCKET = "announcement-images";
const MAX_IMAGES = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/gif", "image/jpeg", "image/png", "image/webp"];

type NewImage = { id: string; file: File; previewUrl: string };

type FormModalProps = {
  mode: "new" | "edit";
  item: AdminAnnouncementVM | null;
  t: AnnCopy;
  roleLabel: RoleLabel;
  organizations: { id: string; name: string }[];
  roleCountsByOrg: Record<string, AdminAnnouncementRoleCount[]>;
  onClose: () => void;
  onSaved: () => void;
};

function getFileExtension(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
  return file.type.split("/")[1] ?? "jpg";
}

export function AnnouncementFormModal({
  mode,
  item,
  t,
  roleLabel,
  organizations,
  roleCountsByOrg,
  onClose,
  onSaved,
}: FormModalProps) {
  const isNew = mode === "new";
  const [org, setOrg] = useState(
    () => item?.organizationId ?? organizations[0]?.id ?? "",
  );
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.content ?? "");
  const [scope, setScope] = useState<"everyone" | "roles">(
    item?.targetScope ?? "everyone",
  );
  const [roles, setRoles] = useState<OrganizationRole[]>(item?.targetRoles ?? []);
  const [status, setStatus] = useState<"draft" | "published">(
    item && item.status !== "archived" ? item.status : "draft",
  );
  const [important, setImportant] = useState(item?.isImportant ?? false);
  const [pinned, setPinned] = useState(item?.isPinned ?? false);
  const [popup, setPopup] = useState(item?.popup ?? false);
  const [popupDate, setPopupDate] = useState(item?.popupUntil?.slice(0, 10) ?? "");
  const [popupTime, setPopupTime] = useState(
    item?.popupUntil?.slice(11, 16) || "23:59",
  );
  const [existingImages, setExistingImages] = useState<string[]>(
    item?.images ?? [],
  );
  const [newImages, setNewImages] = useState<NewImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startServerTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modalRef = useAdminPanelA11y<HTMLDivElement>(onClose, {
    disabled: pending || uploading,
  });

  const totalImages = existingImages.length + newImages.length;
  const busy = pending || uploading;

  const orgOptions: AdmOption[] = organizations.map((o) => ({
    value: o.id,
    label: o.name,
  }));

  const roleList = useMemo(() => {
    const counts = new Map(
      (roleCountsByOrg[org] ?? []).map((r) => [r.role, r.count]),
    );
    return organizationRoles.map((role) => ({
      role,
      count: counts.get(role) ?? 0,
    }));
  }, [org, roleCountsByOrg]);

  function toggleRole(role: OrganizationRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;
    if (selected.some((f) => !ALLOWED_TYPES.includes(f.type))) {
      setError(t.fImgBadType);
      return;
    }
    if (totalImages + selected.length > MAX_IMAGES) {
      setError(t.fImgTooMany);
      return;
    }
    if (selected.some((f) => f.size > MAX_BYTES)) {
      setError(t.fImgTooLarge);
      return;
    }
    setError(null);
    void Promise.all(
      selected.map(async (file) => {
        const compressed = await compressImageFile(file);
        return {
          id: crypto.randomUUID(),
          file: compressed,
          previewUrl: URL.createObjectURL(compressed),
        };
      }),
    ).then((items) => setNewImages((prev) => [...prev, ...items]));
  }

  function removeExisting(url: string) {
    setExistingImages((prev) => prev.filter((u) => u !== url));
  }

  function removeNew(id: string) {
    setNewImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      setError(t.vTitleRequired);
      return;
    }
    if (!trimmedBody) {
      setError(t.vBodyRequired);
      return;
    }
    if (scope === "roles" && roles.length === 0) {
      setError(t.vRolesRequired);
      return;
    }
    if (isNew && !org) {
      setError(t.errProcess);
      return;
    }
    setError(null);

    const announcementId = item?.id ?? crypto.randomUUID();
    const targetOrg = item?.organizationId ?? org;
    const uploadedUrls: string[] = [];
    const uploadedPaths: string[] = [];

    if (newImages.length > 0) {
      setUploading(true);
      try {
        const supabase = getSupabaseBrowserClient();
        for (const image of newImages) {
          const ext = getFileExtension(image.file);
          const path = `${targetOrg}/${announcementId}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, image.file, {
              contentType: image.file.type,
              upsert: false,
            });
          if (uploadError) {
            if (isNew && uploadedPaths.length > 0) {
              startTransition(async () => {
                await cleanupAnnouncementImagePaths(announcementId, uploadedPaths);
              });
            }
            setError(t.errProcess);
            setUploading(false);
            return;
          }
          uploadedPaths.push(path);
          uploadedUrls.push(
            supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
          );
        }
      } catch {
        if (isNew && uploadedPaths.length > 0) {
          startTransition(async () => {
            await cleanupAnnouncementImagePaths(announcementId, uploadedPaths);
          });
        }
        setError(t.errProcess);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const imageUrls = [...existingImages, ...uploadedUrls];
    const popupUntil = popup && popupDate ? `${popupDate}T${popupTime || "23:59"}` : null;

    startServerTransition(async () => {
      const result = await saveAnnouncementConsole({
        announcementId,
        organizationId: targetOrg,
        title: trimmedTitle,
        content: trimmedBody,
        status,
        targetScope: scope,
        targetRoles: scope === "roles" ? roles : [],
        imageUrls,
        isImportant: important,
        isPinned: pinned,
        showPopup: popup,
        popupUntil,
      });
      if (result.ok) {
        for (const image of newImages) URL.revokeObjectURL(image.previewUrl);
        onSaved();
      } else {
        setError(t.errProcess);
      }
    });
  }

  const orgName = organizations.find((o) => o.id === org)?.name ?? "";

  return (
    <>
      <div className="modal-scrim on" onClick={busy ? undefined : onClose} />
      <div
        ref={modalRef}
        className="modal on"
        style={{ width: 620 }}
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? t.fNewKicker : t.fEditKicker}
        tabIndex={-1}
      >
        <div className="modal__h">
          <div>
            <div className="modal__kicker">{isNew ? t.fNewKicker : t.fEditKicker}</div>
            <div className="modal__t">{isNew ? t.fNewTitle : title || t.fEditKicker}</div>
          </div>
          <button
            type="button"
            className="panel__x"
            onClick={onClose}
            aria-label={t.fCancel}
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="modal__body">
          {/* 조직 */}
          <div className="fld">
            <label className="fld__l">{t.fOrg}</label>
            {isNew && organizations.length > 1 ? (
              <AdmDropdown
                options={orgOptions}
                value={org}
                onChange={setOrg}
                ariaLabel={t.fOrg}
                wide
              />
            ) : (
              <input value={orgName} readOnly />
            )}
          </div>

          {/* 제목 */}
          <div className="fld">
            <label className="fld__l">
              {t.fTitle} <span className="req">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.fTitlePh}
            />
          </div>

          {/* 본문 */}
          <div className="fld">
            <label className="fld__l">
              {t.fBody} <span className="req">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ minHeight: 120 }}
              placeholder={t.fBodyPh}
            />
          </div>

          {/* 이미지 */}
          <div className="fld">
            <label className="fld__l">
              {t.fImages}{" "}
              <span style={{ color: "var(--muted)", fontWeight: 700 }}>{t.fImagesMax}</span>
            </label>
            <div className="imgslots">
              {existingImages.map((url) => (
                <div className="imgslot" key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" src={url} />
                  <button
                    type="button"
                    className="imgslot__x"
                    onClick={() => removeExisting(url)}
                    aria-label={t.close}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ))}
              {newImages.map((image) => (
                <div className="imgslot" key={image.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" src={image.previewUrl} />
                  <button
                    type="button"
                    className="imgslot__x"
                    onClick={() => removeNew(image.id)}
                    aria-label={t.close}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ))}
              {totalImages < MAX_IMAGES ? (
                <button
                  type="button"
                  className="imgadd"
                  onClick={() => fileRef.current?.click()}
                >
                  <Ic>
                    <Plus aria-hidden="true" />
                  </Ic>
                  <span>{t.fImgAdd}</span>
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/gif,image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={handlePick}
            />
            <div className="imgcount">{tpl(t.fImageCount, totalImages)}</div>
          </div>

          {/* 대상 범위 */}
          <div className="fld">
            <label className="fld__l">{t.fScope}</label>
            <div className="anseg">
              <button
                type="button"
                className={`ansegopt${scope === "everyone" ? " on" : ""}`}
                onClick={() => setScope("everyone")}
              >
                <span className="ansegopt__ic">
                  <Ic>
                    <Megaphone aria-hidden="true" />
                  </Ic>
                </span>
                <span className="ansegopt__t">
                  <b>{t.fScopeEveryone}</b>
                  <small>{t.fScopeEveryoneSub}</small>
                </span>
                <span className="ansegopt__rd" />
              </button>
              <button
                type="button"
                className={`ansegopt${scope === "roles" ? " on" : ""}`}
                onClick={() => setScope("roles")}
              >
                <span className="ansegopt__ic">
                  <Ic>
                    <Users aria-hidden="true" />
                  </Ic>
                </span>
                <span className="ansegopt__t">
                  <b>{t.fScopeRoles}</b>
                  <small>{t.fScopeRolesSub}</small>
                </span>
                <span className="ansegopt__rd" />
              </button>
            </div>
          </div>

          {/* 대상 역할 */}
          <div className="fld">
            <label className="fld__l">{t.fRoles}</label>
            <div className={`rolechips${scope === "roles" ? "" : " is-off"}`}>
              {roleList.map(({ role, count }) => (
                <button
                  type="button"
                  className={`rolechip${roles.includes(role) ? " on" : ""}`}
                  key={role}
                  onClick={() => toggleRole(role)}
                >
                  <Ic>
                    <Users aria-hidden="true" />
                  </Ic>
                  {roleLabel(role)}
                  <span className="rolechip__n">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 상태 */}
          <div className="fld">
            <label className="fld__l">{t.fStatus}</label>
            <div className="anseg">
              <button
                type="button"
                className={`ansegopt${status === "draft" ? " on" : ""}`}
                onClick={() => setStatus("draft")}
              >
                <span className="ansegopt__ic">
                  <Ic>
                    <Sparkles aria-hidden="true" />
                  </Ic>
                </span>
                <span className="ansegopt__t">
                  <b>{t.fStDraft}</b>
                  <small>{t.fStDraftSub}</small>
                </span>
                <span className="ansegopt__rd" />
              </button>
              <button
                type="button"
                className={`ansegopt${status === "published" ? " on" : ""}`}
                onClick={() => setStatus("published")}
              >
                <span className="ansegopt__ic">
                  <Ic>
                    <Send aria-hidden="true" />
                  </Ic>
                </span>
                <span className="ansegopt__t">
                  <b>{t.fStPublish}</b>
                  <small>{t.fStPublishSub}</small>
                </span>
                <span className="ansegopt__rd" />
              </button>
            </div>
          </div>

          {/* 표시 옵션 */}
          <div className="fld">
            <label className="fld__l">{t.fOptions}</label>
            <div className={`tglrow${important ? " on" : ""}`}>
              <span className="tglrow__ic">
                <Ic>
                  <ShieldAlert aria-hidden="true" />
                </Ic>
              </span>
              <div className="tglrow__b">
                <div className="tglrow__t">{t.fImportant}</div>
                <div className="tglrow__s">{t.fImportantSub}</div>
              </div>
              <button
                type="button"
                className={`tgl${important ? " on" : ""}`}
                onClick={() => setImportant((v) => !v)}
                aria-pressed={important}
                aria-label={t.fImportant}
              />
            </div>
            <div className={`tglrow${pinned ? " on" : ""}`}>
              <span className="tglrow__ic">
                <Ic>
                  <Pin aria-hidden="true" />
                </Ic>
              </span>
              <div className="tglrow__b">
                <div className="tglrow__t">{t.fPinned}</div>
                <div className="tglrow__s">{t.fPinnedSub}</div>
              </div>
              <button
                type="button"
                className={`tgl${pinned ? " on" : ""}`}
                onClick={() => setPinned((v) => !v)}
                aria-pressed={pinned}
                aria-label={t.fPinned}
              />
            </div>
            <div className={`tglrow${popup ? " on" : ""}`}>
              <span className="tglrow__ic">
                <Ic>
                  <Megaphone aria-hidden="true" />
                </Ic>
              </span>
              <div className="tglrow__b">
                <div className="tglrow__t">{t.fPopup}</div>
                <div className="tglrow__s">{t.fPopupSub}</div>
              </div>
              <button
                type="button"
                className={`tgl${popup ? " on" : ""}`}
                onClick={() => setPopup((v) => !v)}
                aria-pressed={popup}
                aria-label={t.fPopup}
              />
            </div>
            {popup ? (
              <div className="subfld">
                <div className="subfld__l">
                  <Ic>
                    <Clock aria-hidden="true" />
                  </Ic>
                  {t.fPopupUntil}
                </div>
                <div className="dtinput">
                  <input
                    type="date"
                    value={popupDate}
                    onChange={(e) => setPopupDate(e.target.value)}
                  />
                  <input
                    type="time"
                    value={popupTime}
                    onChange={(e) => setPopupTime(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="fld__l" style={{ color: "var(--danger)" }} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="modal__foot">
          <span className="modal__foot-note">
            <Ic>
              <ShieldCheck aria-hidden="true" />
            </Ic>
            {status === "published" ? t.fPublishNote : t.fDraftNote}
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={busy}
            >
              {t.fCancel}
            </button>
            <button
              type="button"
              className={`btn ${status === "published" ? "btn--donesolid" : "btn--pri"}`}
              onClick={handleSubmit}
              disabled={busy}
            >
              <Ic>
                {status === "published" ? (
                  <Send aria-hidden="true" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
              </Ic>
              {status === "published"
                ? t.fPublish
                : isNew
                  ? t.fSaveDraft
                  : t.fSave}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
