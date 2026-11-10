import type { Metadata } from "next";
import { Play } from "@/components/Play";
import { challengeText, readChallenge } from "@/lib/og";

/** Challenge links (and shared scores, which link to one) preview as "Beat 2,410 · 5 songs". */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const code = (await searchParams).c;
  const c = readChallenge(typeof code === "string" ? code : null);
  if (!c) return {};
  const { title, line } = challengeText(c);
  const image = { url: `/og?c=${encodeURIComponent(code as string)}`, width: 1200, height: 630, alt: `${title} on Earshot` };
  return {
    title: `${title} · Earshot`,
    description: line,
    openGraph: { title: `${title} on Earshot`, description: line, images: [image] },
    twitter: { card: "summary_large_image", title: `${title} on Earshot`, description: line, images: [image.url] },
  };
}

export default function PlayPage() {
  return <Play />;
}
