import type { NextConfig } from "next";
import { REVIEW_FORBIDDEN_ENV, REVIEW_FORBIDDEN_ENV_PATTERN } from "./src/shared/review/model";
if (process.env.BYETERY_REVIEW_ADAPTER === "DIRECT_REVIEW" && Object.keys(process.env).some(k =>
  (REVIEW_FORBIDDEN_ENV as readonly string[]).includes(k) || REVIEW_FORBIDDEN_ENV_PATTERN.test(k))) throw new Error("ConfigurationUnavailable");
const config: NextConfig = {
  // Disjoint physical route conventions. Legacy catch-all/auth routes are not
  // discovered, compiled or reachable in the DIRECT_REVIEW artifact.
  pageExtensions: process.env.BYETERY_REVIEW_ADAPTER === "DIRECT_REVIEW" ? ["review.ts", "review.tsx"] : ["ts", "tsx"],
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
