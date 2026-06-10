"use client";

import dynamic from "next/dynamic";
import homeHeroTopV2 from "@/assets/home-hero-top-v2.json";

// lottie-web accesses browser APIs (canvas, document) at module init time.
// dynamic({ ssr: false }) prevents SSR failure and ensures correct client hydration.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export function HomeHeroAnimation() {
  return (
    // No card chrome — the animation sits directly on the ivory canvas. A soft
    // radial edge-fade dissolves the outer strands into the background so the 3D
    // motion reads as part of the page rather than a boxed graphic.
    <section className="-mt-1 bg-transparent">
      <Lottie
        aria-hidden="true"
        autoplay
        className="mx-auto h-56 w-full [mask-image:radial-gradient(72%_72%_at_50%_46%,#000_52%,transparent_82%)] [-webkit-mask-image:radial-gradient(72%_72%_at_50%_46%,#000_52%,transparent_82%)]"
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
