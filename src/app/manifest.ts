import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "L'amour de famille",
    short_name: "Famille",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#FFE4EE",
    theme_color: "#FFE4EE",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
