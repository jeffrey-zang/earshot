import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Earshot: name that song in 0.1 seconds",
  description: "A song guessing game. Play the built-in hits catalog or your own Spotify library, playlists and artists.",
};

export const viewport: Viewport = {
  themeColor: "#f1efea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
