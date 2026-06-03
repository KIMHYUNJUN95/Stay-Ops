type PublicSupabaseEnv = {
  anonKey: string;
  url: string;
};

type ServiceSupabaseEnv = PublicSupabaseEnv & {
  serviceRoleKey: string;
};

type Beds24ApiEnv = {
  baseUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
};

function readRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getPublicSupabaseEnv(): PublicSupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL",
    );
  }

  if (!anonKey) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return { anonKey, url };
}

export function getServiceSupabaseEnv(): ServiceSupabaseEnv {
  return {
    ...getPublicSupabaseEnv(),
    serviceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getBeds24ApiEnv(): Beds24ApiEnv {
  const accessToken = process.env.BEDS24_API_TOKEN?.trim() ?? null;
  const refreshToken = process.env.BEDS24_API_REFRESH_TOKEN?.trim() ?? null;

  if (!accessToken && !refreshToken) {
    throw new Error(
      "Missing required environment variable: BEDS24_API_TOKEN or BEDS24_API_REFRESH_TOKEN",
    );
  }

  return {
    baseUrl: readRequiredEnv("BEDS24_API_BASE_URL"),
    accessToken,
    refreshToken,
  };
}

export function getOptionalBeds24ApiEnv(): Beds24ApiEnv | null {
  const baseUrl = process.env.BEDS24_API_BASE_URL?.trim();
  const accessToken = process.env.BEDS24_API_TOKEN?.trim() ?? null;
  const refreshToken = process.env.BEDS24_API_REFRESH_TOKEN?.trim() ?? null;

  if (!baseUrl || (!accessToken && !refreshToken)) {
    return null;
  }

  return { baseUrl, accessToken, refreshToken };
}
