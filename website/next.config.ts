import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Generated NexAPI code imports siblings as "./types.js" (what Node ESM requires). Tell webpack
  // that such an import may be satisfied by the TypeScript source next to it.
  webpack: (webpackConfig: { resolve?: { extensionAlias?: Record<string, string[]> } }) => {
    const resolve = webpackConfig.resolve ?? {};
    resolve.extensionAlias = {
      ...resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    webpackConfig.resolve = resolve;
    return webpackConfig;
  },
};
export default config;
