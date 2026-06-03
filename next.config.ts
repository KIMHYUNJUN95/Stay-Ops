import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "sspdgzkytkpmquqsfaup.supabase.co",
        pathname: "/storage/v1/object/public/announcement-images/**",
        protocol: "https",
      },
      {
        hostname: "sspdgzkytkpmquqsfaup.supabase.co",
        pathname: "/storage/v1/object/public/request-images/**",
        protocol: "https",
      },
    ],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
