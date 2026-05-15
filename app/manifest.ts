import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Names Match",
    short_name: "Names",
    description: "Swipe baby names together until you both like one.",
    start_url: "/",
    display: "standalone",
    background_color: "#fef3c7",
    theme_color: "#fef3c7",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
