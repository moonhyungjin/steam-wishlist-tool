import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { OG_IMAGE, SITE_URL } from "./siteMeta";
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "My Steam Wishlist",
  description: "Personal Steam wishlist dashboard",
  openGraph: {
    title: "My Steam Wishlist",
    description: "Personal Steam wishlist dashboard",
    siteName: "My Steam Wishlist",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
};
// Without this, mobile browsers assume a ~980px desktop-width page and scale the whole thing down
// to fit the screen - everything renders tiny instead of actually reflowing at phone width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1720",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
