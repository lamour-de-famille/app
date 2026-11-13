import type { DepotFamille } from "@/lib/domaine/depot";
import { DepotMemoire } from "@/lib/domaine/depot-memoire";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import type { DateJour } from "@/lib/domaine/types";
import { choisirVueAujourdhui, type VueAujourdhui } from "./aujourdhui";

/** Chargeur serveur : lit le dépôt, puis délègue le choix à la fonction pure. */
export async function chargerAujourdhui(
  depot: DepotFamille,
  adulteId: string,
  date: DateJour,
): Promise<VueAujourdhui> {
  const [famille, gardes, presences, transferts] = await Promise.all([
    depot.lireFamille(),
    depot.listerGardes({ du: date, au: date }),
    depot.listerPresences({ du: date, au: date }),
    depot.listerTransferts({ du: date }),
  ]);
  return choisirVueAujourdhui({ famille, adulteId, date, gardes, presences, transferts });
}

const ajouter = (date: DateJour, jours: number): DateJour => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};

/** Dépôt de démonstration (famille fictive) peuplé autour de `date`. Développement uniquement. */
export async function depotDemonstration(date: DateJour): Promise<DepotFamille> {
  const depot = new DepotMemoire(familleFictive);
  const alex = "alex";
  await depot.definirGarde(alex, { enfantId: "leo", date, responsableId: "alex" });
  await depot.definirGarde(alex, { enfantId: "mila", date, responsableId: "alex" });
  await depot.definirGarde(alex, { enfantId: "nina", date, responsableId: "sam" });
  await depot.definirPresence(alex, { enfantId: "leo", date, lieuId: "dom-alex" });
  await depot.definirPresence(alex, { enfantId: "mila", date, lieuId: "dom-sam" });
  await depot.definirPresence(alex, { enfantId: "nina", date, lieuId: "grands-parents" });
  await depot.enregistrerTransfert(alex, {
    date: ajouter(date, 1),
    heure: "17:30",
    lieuId: "ecole",
    deposeId: "alex",
    recupereId: "sam",
    enfantIds: ["leo", "mila"],
  });
  return depot;
}
