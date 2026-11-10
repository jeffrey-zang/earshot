import type { Metadata } from "next";
import { Explore } from "@/components/Explore";

export const metadata: Metadata = { title: "Explore · Earshot" };

export default function ExplorePage() {
  return <Explore />;
}
