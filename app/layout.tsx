import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "My Steam Wishlist",
  description: "Personal Steam wishlist dashboard",
};
// Without this, mobile browsers assume a ~980px desktop-width page and scale the whole thing down
// to fit the screen - everything renders tiny instead of actually reflowing at phone width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
