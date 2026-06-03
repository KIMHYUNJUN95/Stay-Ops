"use client";

import dynamic from "next/dynamic";
import homeHeroTopV2 from "@/assets/home-hero-top-v2.json";

// lottie-web accesses browser APIs (canvas, document) at module init time.
// dynamic({ ssr: false }) prevents SSR failure and ensures correct client hydration.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export function HomeHeroAnimation() {
  return (
    <section className="overflow-hidden rounded-[30px] border border-slate-100 bg-white">
      <Lottie
        aria-hidden="true"
        autoplay
        className="mx-auto h-56 w-full"
        animationData={homeHeroTopV2}
        loop
      />
      {/*
        Previous top hero source kept for possible reuse:
        /public/animations/home-hero.lottie (DotLottieReact)
      */}
    </section>
  );
}
