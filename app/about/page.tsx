import type { Metadata } from "next";
import { AboutView } from "./AboutView";
import { EN } from "./content";

export const metadata: Metadata = {
  title: EN.metaTitle,
  description: EN.metaDescription,
  openGraph: {
    title: EN.metaTitle,
    description: EN.metaDescription,
    type: "website",
  },
};

export default function AboutPage() {
  return <AboutView content={EN} />;
}
