import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler — 자동 메모이제이션.
  //
  // **이 코드베이스는 오래전부터 컴파일러가 켜져 있다고 전제하고 쓰여 왔다.** `tasks-workspace.tsx`
  // 에는 "React Compiler 가 메모이제이션을 보존하지 못하고 컴포넌트 전체를 포기한다"는 이유로
  // `useMemo` 를 넣거나 선언 순서를 맞춘 주석이 여럿 있다. 그런데 실제로는 설정도 패키지도 없어
  // **꺼진 상태였다**(2026-09-03 확인). 즉 그 배려가 아무 효과도 못 내고 있었다.
  //
  // 켜는 이유: 관리자 투두 콘솔(4900줄)과 모바일 워크스페이스(2500줄)는 메모이제이션 경계가 없어
  // state 하나만 바뀌어도 본문 전체가 다시 실행된다. 그 둘을 손으로 쪼개는 것은 상태 결합도가
  // 높아 회귀 위험이 크다 — 컴파일러가 같은 문제를 훨씬 안전하게 푼다.
  reactCompiler: true,
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
