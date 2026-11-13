"use client";
import { usePathname } from "next/navigation";
import { BarreNavigation } from "./BarreNavigation";

export function NavigationBasse() {
  return <BarreNavigation chemin={usePathname()} />;
}
