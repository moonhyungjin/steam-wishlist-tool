// Shared link-preview identity. Metadata that sets its own `openGraph` replaces the parent's
// wholesale rather than merging, so every page that defines one (about, poll) has to name the
// image itself - hence a shared constant instead of relying on the root layout's default.
const PRODUCTION_URL = "https://steam-wishlist-tool.vercel.app";

// Relative image paths in og: tags need an absolute base to resolve against. Falls back to the
// known production domain (not localhost) outside dev, so a missing Vercel system env var can
// never ship a preview image URL pointing at localhost.
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : PRODUCTION_URL;

export const OG_IMAGE = {
  url: "/og-poll.png",
  width: 1200,
  height: 630,
  alt: "My Steam Wishlist - 친구들과 투표로 정해요",
};
