import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StationHarbor",
    short_name: "StationHarbor",
    description: "Live radio, everywhere.",
    start_url: "/",
    display: "standalone",
    background_color: "#111211",
    theme_color: "#111211",
  };
}
