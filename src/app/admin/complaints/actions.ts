"use server";

// 컴플레인 콘솔 서버 액션 — 외부 리뷰 → 수동 컴플레인 전환, 외부 리뷰 번역 요청.
//
// 둘 다 폼 데이터의 reviewId만 신뢰하지 않는다: `getExternalReview`/`convertReviewToComplaint`/
// `translateReviewPart`가 세션 조직으로 다시 스코프를 좁힌다. 여기서는 진입 시점 권한만 먼저 막고,
// 실패는 조용히 원래 상세로 되돌아간다 — 리뷰 상세 자체는 읽기 화면이라 별도 에러 배너 카피가 아직 없다.
//
// 도메인 계약: docs/product/25-complaint-workflow.md → "External Review Fields", "Review Translation"

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canWriteComplaint, deleteComplaint } from "@/lib/complaints";
import { getCurrentAppSession } from "@/lib/session";
import { convertReviewToComplaint, getExternalReview } from "@/lib/external-reviews";
import { translateReviewPart, type TranslationPart } from "@/lib/review-translate";

/** redirectTo는 항상 이 콘솔 안에서만 온다 — open redirect 방지. */
function redirectTarget(formData: FormData): string {
  const target = String(formData.get("redirectTo") ?? "").trim();
  return target.startsWith("/admin/complaints") ? target : "/admin/complaints";
}

/**
 * 외부 리뷰를 근거로 수동 컴플레인을 만든다.
 *
 * 제목을 비워 두면 리뷰 headline → 본문(원문 텍스트) 앞부분 순으로 기본값을 만든다. 실제 스냅샷
 * 보존과 중복 전환 방지는 `convertReviewToComplaint`가 담당한다.
 */
export async function convertReviewAction(formData: FormData): Promise<void> {
  const session = await getCurrentAppSession();
  const target = redirectTarget(formData);
  if (!session) redirect("/admin/complaints");
  if (!canWriteComplaint(session.user.role)) redirect(target);

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  if (!reviewId) redirect(target);

  const review = await getExternalReview({ session, id: reviewId });
  if (!review) redirect(target);

  const titleInput = String(formData.get("title") ?? "").trim();
  const title =
    titleInput ||
    review.headline?.trim() ||
    review.reviewText?.trim().slice(0, 60) ||
    review.positiveReviewText?.trim().slice(0, 60) ||
    review.negativeReviewText?.trim().slice(0, 60) ||
    `${review.provider} ${review.externalReviewId}`;

  try {
    await convertReviewToComplaint({ session, reviewId, title });
    revalidatePath("/admin/complaints");
  } catch {
    // 이미 전환됐거나(already_linked) 권한/조직이 어긋난 경우 — 상세를 그대로 다시 보여준다.
  }
  redirect(target);
}

/**
 * 수동 컴플레인 삭제 (MVP hard delete — 문서 25 §"컴플레인 본체는 hard delete").
 *
 * 권한(작성자 본인 또는 owner/office_admin/super-admin)은 `deleteComplaint`가 서버에서 다시 검증한다.
 * 폼의 complaintId만 신뢰하지 않는다. 되돌릴 수 없으므로 호출부(모달)에서 확인 UX를 거친다.
 * redirect 없이 revalidate만 한다 — 클라이언트가 목록에 남은 채로 서버 컴포넌트가 갱신된다.
 */
export async function deleteComplaintAction(formData: FormData): Promise<void> {
  const session = await getCurrentAppSession();
  if (!session) return;

  const id = String(formData.get("complaintId") ?? "").trim();
  if (!id) return;

  try {
    await deleteComplaint({ session, id });
  } catch {
    // 이미 삭제됐거나(not_found) 권한/조직이 어긋난 경우 — 목록을 그대로 다시 그린다.
  }
  revalidatePath("/admin/complaints");
}

/**
 * 리뷰의 텍스트가 있는 파트(공개/긍정/부정/제목/비공개)를 현재 사용자 언어로 번역해 캐시에 남긴다.
 *
 * 이미 캐시된 조합은 `translateReviewPart`가 즉시 반환하므로, 이 액션은 "번역 보기"를 누를 때마다
 * 매번 불러도 새 DeepL 호출을 만들지 않는다.
 */
export async function translateReviewAction(formData: FormData): Promise<void> {
  const session = await getCurrentAppSession();
  const target = redirectTarget(formData);
  if (!session) redirect("/admin/complaints");

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  if (!reviewId) redirect(target);

  const review = await getExternalReview({ session, id: reviewId });
  if (!review) redirect(target);

  const organizationId = session.organization.id;
  const targetLocale = session.user.preferredLanguage;

  const parts: { part: TranslationPart; text: string | null }[] = [
    { part: "review", text: review.reviewText },
    { part: "positive", text: review.positiveReviewText },
    { part: "negative", text: review.negativeReviewText },
    { part: "headline", text: review.headline },
    { part: "private", text: review.privateFeedback },
  ];

  await Promise.all(
    parts
      .filter((entry): entry is { part: TranslationPart; text: string } => Boolean(entry.text?.trim()))
      .map((entry) =>
        translateReviewPart({
          organizationId,
          externalReviewId: reviewId,
          part: entry.part,
          targetLocale,
          sourceText: entry.text,
          sourceLanguageCode: review.sourceLanguageCode,
        }),
      ),
  );

  revalidatePath("/admin/complaints");
  redirect(target);
}
