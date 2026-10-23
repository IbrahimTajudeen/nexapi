import type { NextConfig } from "next";

const originOf = (value: string | undefined): string | null => {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
};

const isProd = process.env["NODE_ENV"] === "production";
const supabase = originOf(process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"]);

/**
 * Content Security Policy. The admin panel holds a sign-in session, so its policy forbids eval.
 * The docs, tutorials and playground run code that visitors type or that the examples contain
 * (through the Function constructor), so those pages additionally need 'unsafe-eval'. Next.js
 * inlines small bootstrap scripts, which is why 'unsafe-inline' is present for scripts; a nonce
 * would force every page to render on demand and lose static pages.
 */
function csp(allowEval: boolean): string {
  const connect = ["'self'", supabase, "https://api.cloudinary.com"].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${allowEval ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      // Admin: no eval, never indexed or cached by shared caches.
      {
        source: "/admin/:path*",
        headers: [
          ...common,
          { key: "Content-Security-Policy", value: csp(false) },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      // Everything else except the API (which sets its own headers).
      {
        source: "/((?!admin|api).*)",
        headers: [...common, { key: "Content-Security-Policy", value: csp(true) }],
      },
    ]);
  },
  // Generated NyxAPI code imports siblings as "./types.js" (what Node ESM requires). Tell webpack
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
