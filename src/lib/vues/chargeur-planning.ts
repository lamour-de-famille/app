import type { DepotFamille } from "@/lib/domaine/depot";
import type { DateJour } from "@/lib/domaine/types";
import { depotDemonstration } from "./chargeur";
import { grilleMois } from "./mois";
import { choisirVuePlanning, type VuePlanning } from "./planning";

/** Chargeur serveur du planning : lit la période affichée (grille complète) puis délègue à la fonction pure. */
export async function chargerPlanning(
  depot: DepotFamille,
  adulteId: string,
  annee: number,
  mois: number,
  jourChoisi: DateJour,
): Promise<VuePlanning> {
  const cellules = grilleMois(annee, mois).flat();
  const du = cellules[0]!.date;
  const au = cellules[cellules.length - 1]!.date;
  const [famille, presences, gardes, transferts, demandes] = await Promise.all([
    depot.lireFamille(),
    depot.listerPresences({ du, au }),
    depot.listerGardes({ du: jourChoisi, au: jourChoisi }),
    depot.listerTransferts({ du: jourChoisi, au: jourChoisi }),
    depot.listerDemandes(),
  ]);
  return choisirVuePlanning({ famille, adulteId, annee, mois, jourChoisi, presences, gardes, transferts, demandes });
}

const ajouter = (date: DateJour, jours: number): DateJour => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};

/**
 * Dépôt de démonstration avec un mois de présences fictives (semaines alternées chez Alex et chez Sam,
 * Nina chez les grands-parents le mercredi) et une demande reçue de Sam. Développement uniquement.
 */
export async function depotDemonstrationMois(date: DateJour): Promise<DepotFamille> {
  const depot = await depotDemonstration(date);
  const debut = `${date.slice(0, 7)}-01`;
  const dejaRenseignes = new Set((await depot.listerPresences({ du: date, au: date })).map((p) => p.date));
  for (let i = 0; i < 31; i++) {
    const jour = ajouter(debut, i);
    if (jour.slice(0, 7) !== debut.slice(0, 7) || dejaRenseignes.has(jour)) continue;
    const semaine = Math.floor(i / 7) % 2;
    const chez = semaine === 0 ? "dom-alex" : "dom-sam";
    const mercredi = new Date(`${jour}T12:00:00Z`).getUTCDay() === 3;
    await depot.definirPresence("alex", { enfantId: "leo", date: jour, lieuId: chez });
    await depot.definirPresence("alex", { enfantId: "mila", date: jour, lieuId: chez });
    await depot.definirPresence("alex", {
      enfantId: "nina",
      date: jour,
      lieuId: mercredi ? "grands-parents" : chez,
    });
  }
  await depot.proposerEchange("sam", {
    responsableId: "sam",
    enfantIds: ["leo"],
    jours: [ajouter(date, 6), ajouter(date, 7)],
  });
  return depot;
}

const CLE = Symbol.for("lamour.depot-demonstration");
type Global = { [CLE]?: { date: DateJour; depot: Promise<DepotFamille> } };

/** Dépôt partagé entre les requêtes d'un même processus, pour que les réponses restent visibles. */
export function depotPartage(date: DateJour): Promise<DepotFamille> {
  const g = globalThis as unknown as Global;
  if (!g[CLE] || g[CLE].date !== date) g[CLE] = { date, depot: depotDemonstrationMois(date) };
  return g[CLE].depot;
}
