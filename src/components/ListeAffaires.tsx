"use client";
import { useEffect, useState } from "react";
import { basculer, charger, enregistrer, type EtatAffaires } from "@/lib/vues/affaires";
import type { Affaire } from "@/lib/vues/aujourdhui";

/** Liste cochable ; chaque case est un vrai input avec son label ; l'état reste dans le navigateur. */
export function ListeAffaires({ adulteId, affaires }: { adulteId: string; affaires: Affaire[] }) {
  const [etat, setEtat] = useState<EtatAffaires>({});

  useEffect(() => {
    // Lecture du stockage local après le rendu : ne peut pas se faire côté serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEtat(charger(window.localStorage, adulteId));
  }, [adulteId]);

  function cocher(cle: string) {
    const suivant = basculer(etat, cle);
    setEtat(suivant);
    enregistrer(window.localStorage, adulteId, suivant);
  }

  if (affaires.length === 0) return <p>Rien à emmener pour le moment.</p>;
  const faites = affaires.filter((a) => etat[a.cle]).length;
  return (
    <div>
      <p aria-live="polite">
        {faites} sur {affaires.length} prêtes
      </p>
      <ul className="affaires">
        {affaires.map((a) => (
          <li key={a.cle}>
            <label>
              <input type="checkbox" checked={Boolean(etat[a.cle])} onChange={() => cocher(a.cle)} />
              <span>
                {a.libelle} <span className="discret">({a.enfant})</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
