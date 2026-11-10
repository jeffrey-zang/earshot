import type { Metadata } from "next";
import { Custom } from "@/components/Custom";

export const metadata: Metadata = { title: "Pick your songs · Earshot" };

export default function CustomPage() {
  return <Custom />;
}
