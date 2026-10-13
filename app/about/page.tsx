import type { Metadata } from "next";
import { AboutView } from "./AboutView";
import { EN } from "./content";
import { OG_IMAGE } from "../siteMeta";

export const metadata: Metadata = {
  title: EN.metaTitle,
  description: EN.metaDescription,
  openGraph: {
    title: EN.metaTitle,
    description: EN.metaDescription,
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
};

export default function AboutPage() {
  return <AboutView content={EN} />;
}
