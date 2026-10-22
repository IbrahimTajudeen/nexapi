import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { SITE_URL } from "@/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "NyxAPI: typed API clients generated from your schema",
    template: "%s · NyxAPI",
  },
  description:
    "NyxAPI turns an OpenAPI schema into a fluent, fully typed TypeScript client, with a built-in query and mutation engine and a React adapter. Open source.",
  openGraph: {
    title: "NyxAPI",
    description:
      "Typed API clients generated from your schema, with caching built in. Open source.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#091219" },
  ],
};

// Runs before first paint so the saved theme never flashes the wrong colours.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="sr-only">
          Skip to content
        </a>
        <Providers>
          <AnnouncementBanner />
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
