import type { NextConfig } from "next";

// The app is a fully client-rendered SPA that talks to the FastAPI backend over
// NEXT_PUBLIC_API_URL, so it can be deployed as a static export anywhere.
//
// GitHub Pages (project site) needs a basePath of /<repo>. That is opt-in via
// GITHUB_PAGES=true so other hosts (Vercel, Netlify, Render static, S3) build
// at the root with no basePath.
const usePages = process.env.GITHUB_PAGES === "true";
const basePath = process.env.PAGES_BASE_PATH ?? "/equilibrium";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: usePages ? basePath : "",
  assetPrefix: usePages ? `${basePath}/` : "",
  trailingSlash: true,
};

export default nextConfig;
