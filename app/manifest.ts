import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Steam Wishlist",
    short_name: "Steam Wishlist",
    description: "Personal Steam wishlist dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1720",
    theme_color: "#0f1720",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  };
}
