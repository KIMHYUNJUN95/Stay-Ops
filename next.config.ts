import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev resource access (HMR + client chunks) when the app is opened via
  // the WSL network IP instead of localhost. Dev-only; no effect on production.
  // `*.trycloudflare.com` covers Cloudflare quick tunnels (random subdomain each
  // run) so the app can be opened on a phone over any network, not just same-WiFi.
  allowedDevOrigins: ["172.20.50.244", "10.255.255.254", "192.168.1.112", "*.trycloudflare.com"],
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
};

export default nextConfig;
