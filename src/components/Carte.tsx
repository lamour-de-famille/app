import type { ReactNode } from "react";

export function Carte({ children, titre, className }: { children: ReactNode; titre?: string; className?: string }) {
  return (
    <section className={className ? `carte ${className}` : "carte"}>
      {titre ? <h2>{titre}</h2> : null}
      {children}
    </section>
  );
}
