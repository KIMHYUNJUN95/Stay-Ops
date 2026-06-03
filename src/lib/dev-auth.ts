/** True when local dev seed-login is enabled (no Supabase email OTP needed). */
export function isDevSeedLoginEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ENABLE_DEV_SEED_LOGIN === "true" &&
    Boolean(process.env.DEV_SEED_LOGIN_PASSWORD?.trim())
  );
}

export function buildDevSeedLoginHref(
  actor: "admin" | "staff",
  next = "/",
) {
  const params = new URLSearchParams({ as: actor, next });
  return `/api/dev/seed-login?${params.toString()}`;
}
