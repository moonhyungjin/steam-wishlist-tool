import type { Metadata } from "next";
import { AboutView } from "../AboutView";
import { KO } from "../content";
import { OG_IMAGE } from "../../siteMeta";

export const metadata: Metadata = {
  title: KO.metaTitle,
  description: KO.metaDescription,
  openGraph: {
    title: KO.metaTitle,
    description: KO.metaDescription,
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
};

export default function AboutPageKo() {
  return <AboutView content={KO} />;
}
