import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";
import { NavigationBasse } from "@/components/NavigationBasse";

export const metadata: Metadata = {
  title: "L'amour de famille",
  description: "Planning et agendas partagés pour la coparentalité.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#FFE4EE" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <NavigationBasse />
      </body>
    </html>
  );
}
