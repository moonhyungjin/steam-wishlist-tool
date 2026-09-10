import type { CapacitorConfig } from "@capacitor/cli";

// The WebView loads the live Vercel deployment directly (server.url), rather than bundling a
// local copy of the site - this keeps the app perpetually in sync with whatever's deployed,
// with no separate "rebuild the app" step needed after a normal web deploy.
const config: CapacitorConfig = {
  appId: "com.steamwishlisttool.app",
  appName: "Steam Wishlist",
  webDir: "public",
  server: {
    url: "https://steam-wishlist-tool.vercel.app",
    androidScheme: "https",
  },
};

export default config;
