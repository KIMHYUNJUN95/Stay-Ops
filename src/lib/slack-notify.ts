import "server-only";

/**
 * Slack 웹훅으로 짧은 알림을 보낸다.
 *
 * `mobile/tasks/report-actions.ts` 에 있던 검증·에러 처리를 그대로 옮겨 공유한다 —
 * 두 벌로 두면 «URL 은 절대 로그에 남기지 않는다» 같은 규칙이 한쪽에서만 지켜진다.
 *
 * 실패해도 **던지지 않는다.** 알림은 부수 작업이라, 알림이 안 갔다고 본 작업(수집·점검)을
 * 실패로 만들면 안 된다. 대신 사유를 반환해 호출부가 응답에 실어 드러낼 수 있게 한다.
 */
export type SlackResult = { ok: true } | { ok: false; reason: string };

export async function postSlackText(text: string): Promise<SlackResult> {
  const webhookUrl = process.env.SLACK_DAILY_REPORT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return { ok: false, reason: "not_configured" };

  try {
    const endpoint = new URL(webhookUrl);
    // 경로에 토큰이 들어 있으므로 URL 전체는 절대 로그에 남기지 않는다.
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "hooks.slack.com") {
      console.warn(
        `[slack] webhook host rejected: ${endpoint.protocol}//${endpoint.hostname} (len=${webhookUrl.length})`,
      );
      return { ok: false, reason: "bad_host" };
    }
  } catch {
    console.warn(`[slack] webhook is not a valid URL (len=${webhookUrl.length})`);
    return { ok: false, reason: "invalid_url" };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[slack] rejected: ${response.status} ${detail.slice(0, 200)}`);
      return { ok: false, reason: `http_${response.status}` };
    }
  } catch (error) {
    console.warn("[slack] fetch failed:", error instanceof Error ? error.message : error);
    return { ok: false, reason: "fetch_failed" };
  }

  return { ok: true };
}
