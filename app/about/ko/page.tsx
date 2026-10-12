import type { Metadata } from "next";
import { AboutView } from "../AboutView";
import { KO } from "../content";

export const metadata: Metadata = {
  title: KO.metaTitle,
  description: KO.metaDescription,
  openGraph: {
    title: KO.metaTitle,
    description: KO.metaDescription,
    type: "website",
  },
};

export default function AboutPageKo() {
  return <AboutView content={KO} />;
}
