import Link from "next/link";

export const LIENS = [
  { href: "/aujourdhui", libelle: "Aujourd'hui" },
  { href: "/planning", libelle: "Planning" },
] as const;

export function BarreNavigation({ chemin }: { chemin: string }) {
  return (
    <nav className="nav-basse" aria-label="Navigation principale">
      <ul>
        {LIENS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={chemin === l.href ? "page" : undefined}>
              {l.libelle}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
