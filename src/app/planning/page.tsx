import Link from "next/link";
import { notFound } from "next/navigation";
import { Bouton } from "@/components/Bouton";
import { Carte } from "@/components/Carte";
import { RepereEnfant } from "@/components/RepereEnfant";
import { chargerPlanning, depotPartage } from "@/lib/vues/chargeur-planning";
import { analyserMois } from "@/lib/vues/mois";
import { proposerEchange, repondreDemande } from "./actions";
import "./planning.css";

export const dynamic = "force-dynamic";

const ADULTES_DEMO = ["alex", "sam"];
const JOURS_SEMAINE = [
  ["lun.", "lundi"],
  ["mar.", "mardi"],
  ["mer.", "mercredi"],
  ["jeu.", "jeudi"],
  ["ven.", "vendredi"],
  ["sam.", "samedi"],
  ["dim.", "dimanche"],
] as const;

function aujourdhuiLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
const formatCourt = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

const MESSAGES: Record<string, string> = {
  acceptee: "Demande acceptée : les jours concernés sont mis à jour et l'autre adulte sera prévenu.",
  refusee: "Demande refusée : rien n'est modifié et l'autre adulte sera prévenu.",
  proposee: "Demande envoyée : l'autre adulte sera prévenu.",
  "erreur-reponse": "Cette demande n'a pas pu être traitée (déjà traitée ou introuvable).",
  erreur: "Une erreur est survenue. Réessayez.",
};

type Params = { adulte?: string; mois?: string; jour?: string; resultat?: string; message?: string };

/** Doublure d'authentification : `?adulte=alex|sam` ; la route est masquée en production. */
export default async function Planning({ searchParams }: { searchParams: Promise<Params> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const adulteId = q.adulte && ADULTES_DEMO.includes(q.adulte) ? q.adulte : "alex";
  const aujourdhui = aujourdhuiLocal();
  const { annee, mois } = analyserMois(q.mois, aujourdhui.slice(0, 7));
  const moisTexte = `${annee}-${String(mois).padStart(2, "0")}`;
  const jour =
    q.jour && /^\d{4}-\d{2}-\d{2}$/.test(q.jour) && q.jour.startsWith(moisTexte)
      ? q.jour
      : aujourdhui.startsWith(moisTexte)
        ? aujourdhui
        : `${moisTexte}-01`;

  const depot = await depotPartage(aujourdhui);
  const [vue, famille] = await Promise.all([
    chargerPlanning(depot, adulteId, annee, mois, jour),
    depot.lireFamille(),
  ]);
  const lien = (m: string, j?: string) => {
    const p = new URLSearchParams({ adulte: adulteId, mois: m });
    if (j) p.set("jour", j);
    return `/planning?${p.toString()}`;
  };
  const resultat = q.resultat ? (q.resultat === "invalide" ? (q.message ?? "Demande incomplète.") : MESSAGES[q.resultat]) : null;
  const autre = famille.adultes.find((a) => a.id !== adulteId)!;

  return (
    <main className="contenu">
      <h1>Planning</h1>
      {resultat ? (
        <p role="status" className="message">
          {resultat}
        </p>
      ) : null}

      <Carte>
        <div className="mois-nav">
          <Link className="bouton bouton--secondaire" href={lien(vue.precedent)}>
            <span aria-hidden="true">‹</span> Mois précédent
          </Link>
          <Link className="bouton bouton--secondaire" href={lien(vue.suivant)}>
            Mois suivant <span aria-hidden="true">›</span>
          </Link>
        </div>
        <h2 className="mois-titre">{vue.titre}</h2>
        <table className="calendrier">
          <caption className="sr-seul">Présence des enfants jour par jour, {vue.titre}</caption>
          <thead>
            <tr>
              {JOURS_SEMAINE.map(([court, long]) => (
                <th key={long} scope="col">
                  <abbr title={long}>{court}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vue.semaines.map((semaine) => (
              <tr key={semaine[0]!.date}>
                {semaine.map((c) => (
                  <td key={c.date} className={c.dansMois ? undefined : "hors-mois"}>
                    <Link
                      href={lien(c.date.slice(0, 7), c.date)}
                      aria-label={c.libelle}
                      aria-current={c.choisi ? "date" : undefined}
                      className={c.choisi ? "jour jour--choisi" : "jour"}
                    >
                      <span className="jour-numero">{c.jour}</span>
                      <span className="reperes">
                        {c.reperes.map((r) => (
                          <RepereEnfant key={r.enfantId} repere={r} />
                        ))}
                      </span>
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="legende" aria-label="Légende">
          <li>
            <span aria-hidden="true" className="repere repere--plein legende-plein">
              ✓
            </span>{" "}
            Rond plein : dort chez vous
          </li>
          <li>
            <span aria-hidden="true" className="repere repere--contour">
              •
            </span>{" "}
            Rond vide : dort chez l&apos;autre adulte
          </li>
          <li>
            <span aria-hidden="true" className="repere repere--tiers">
              –
            </span>{" "}
            Carré gris pointillé : chez un tiers
          </li>
          <li>
            <span aria-hidden="true" className="repere repere--inconnu">
              ?
            </span>{" "}
            Non renseigné
          </li>
        </ul>
        <p className="discret">Un enfant par repère, dans l&apos;ordre : {famille.enfants.map((e) => e.prenom).join(", ")}.</p>
      </Carte>

      <Carte titre={`Détail du ${formatDate(vue.detail.date)}`}>
        <ul className="enfants">
          {vue.detail.enfants.map((e) => (
            <li key={e.enfantId}>
              <div>
                <strong>{e.prenom}</strong>
                <div>Dort : {e.lieu ?? "non renseigné"}</div>
                <div>
                  Garde : {e.garde ?? "non renseignée"}
                  {e.divergence ? " (différente de l'endroit où il dort)" : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {vue.detail.transferts.map((t) => (
          <p key={t.id}>
            Transfert à {t.heure}, {t.lieu} : {t.depose} dépose, {t.recupere} récupère ({t.enfants.join(", ")}).
          </p>
        ))}
      </Carte>

      <Carte titre="Demandes reçues">
        {vue.demandesRecues.length === 0 ? <p>Aucune demande en attente.</p> : null}
        <ul className="demandes">
          {vue.demandesRecues.map((d) => (
            <li key={d.id}>
              <p>
                {d.auteur} demande que {d.responsable === "vous" ? "vous ayez" : `${d.responsable} ait`} la garde de{" "}
                {d.enfants.join(", ")} le {d.jours.map(formatCourt).join(", ")}.
              </p>
              <form action={repondreDemande} className="reponse">
                <input type="hidden" name="adulte" value={adulteId} />
                <input type="hidden" name="mois" value={moisTexte} />
                <input type="hidden" name="demande" value={d.id} />
                <Bouton type="submit" name="reponse" value="acceptee">
                  Accepter
                </Bouton>
                <Bouton type="submit" name="reponse" value="refusee" variante="secondaire">
                  Refuser
                </Bouton>
              </form>
            </li>
          ))}
        </ul>
        {vue.demandesEnvoyees.length > 0 ? (
          <p className="discret">
            {vue.demandesEnvoyees.length} demande(s) envoyée(s) à {autre.prenom}, en attente de réponse.
          </p>
        ) : null}
      </Carte>

      <Carte>
        <details className="proposer">
          <summary>Proposer un échange</summary>
          <form action={proposerEchange} className="formulaire">
            <input type="hidden" name="adulte" value={adulteId} />
            <input type="hidden" name="mois" value={moisTexte} />
            <label>
              Premier jour
              <input type="date" name="du" defaultValue={jour} required />
            </label>
            <label>
              Dernier jour (facultatif)
              <input type="date" name="au" />
            </label>
            <fieldset>
              <legend>Enfants concernés</legend>
              {famille.enfants.map((e) => (
                <label key={e.id} className="choix">
                  <input type="checkbox" name="enfant" value={e.id} /> {e.prenom}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Qui aura la garde ?</legend>
              <label className="choix">
                <input type="radio" name="garde" value="moi" defaultChecked /> Moi
              </label>
              <label className="choix">
                <input type="radio" name="garde" value="autre" /> {autre.prenom}
              </label>
            </fieldset>
            <Bouton type="submit">Envoyer la demande</Bouton>
          </form>
        </details>
      </Carte>
    </main>
  );
}
