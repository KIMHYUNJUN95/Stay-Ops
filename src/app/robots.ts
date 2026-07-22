import type { MetadataRoute } from "next";

/**
 * StayOps is a private, invite-only operations app — there is no public content to index. Disallow
 * all crawlers so login/app pages never show up in search results. (Belt-and-suspenders with the
 * `robots: { index: false }` in the root metadata.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
