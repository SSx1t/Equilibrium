import type { NextConfig } from "next";

// The app is a fully client-rendered SPA that talks to the FastAPI backend over
// NEXT_PUBLIC_API_URL.
//
// - On Vercel (default): build Next.js normally. Vercel handles routing/hosting
//   natively — do NOT use `output: export` (it causes 404s on Vercel).
// - On GitHub Pages (GITHUB_PAGES=true): emit a static export with a /<repo>
//   basePath. Opt-in only, so Vercel/Netlify/etc. build at the root.
// Never apply GitHub Pages basePath/export on Vercel — that makes `/` return 404.
const usePages =
  process.env.GITHUB_PAGES === "true" && !process.env.VERCEL;
const basePath = process.env.PAGES_BASE_PATH ?? "/equilibrium";

const pagesConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: `${basePath}/`,
  trailingSlash: true,
};

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  ...(usePages ? pagesConfig : {}),
};

export default nextConfig;
