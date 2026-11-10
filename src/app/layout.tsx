import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Public_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

/** Steinberg's Petaluma Script: the hand-lettered look of the jazz Real Book (SIL Open Font License, see fonts/Petaluma-OFL.txt). */
const petaluma = localFont({
  src: "./fonts/PetalumaScript.otf",
  variable: "--font-petaluma",
  display: "swap",
});

/** Absolute links for previews come from the address the page was asked for (test tunnels included). */
async function siteUrl(): Promise<URL> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "earshot-xi.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return new URL(`${proto}://${host}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const title = "Earshot";
  const description = "Name the song from a split second of it.";
  return {
    metadataBase: await siteUrl(),
    title,
    description,
    openGraph: { title, description, siteName: "Earshot", type: "website", images: [{ url: "/og", width: 1200, height: 630, alt: "Earshot" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og"] },
  };
}

export const viewport: Viewport = {
  themeColor: "#e9e6dd",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${petaluma.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
