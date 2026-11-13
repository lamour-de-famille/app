import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "L'amour de famille",
  description: "Planning et agendas partagés pour la coparentalité.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#FFE4EE" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
