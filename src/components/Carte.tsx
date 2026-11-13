import type { ReactNode } from "react";

export function Carte({ children, titre }: { children: ReactNode; titre?: string }) {
  return (
    <section className="carte">
      {titre ? <h2>{titre}</h2> : null}
      {children}
    </section>
  );
}
