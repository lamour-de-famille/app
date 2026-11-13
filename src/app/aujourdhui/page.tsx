import { Carte } from "@/components/Carte";
import { ListeAffaires } from "@/components/ListeAffaires";
import { PastilleEnfant } from "@/components/PastilleEnfant";
import { chargerAujourdhui, depotDemonstration } from "@/lib/vues/chargeur";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const ADULTES_DEMO = ["alex", "sam"];

function aujourdhuiLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

/**
 * Tant que l'authentification réelle n'est pas branchée, l'adulte connecté est une doublure :
 * paramètre `?adulte=alex|sam`. Sans authentification ni dépôt réel, la production n'affiche rien.
 */
export default async function Aujourdhui({ searchParams }: { searchParams: Promise<{ adulte?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { adulte } = await searchParams;
  const adulteId = adulte && ADULTES_DEMO.includes(adulte) ? adulte : "alex";
  const date = aujourdhuiLocal();
  const vue = await chargerAujourdhui(await depotDemonstration(date), adulteId, date);
  const t = vue.prochainTransfert;

  return (
    <main className="contenu">
      <h1>Aujourd&apos;hui</h1>
      <p className="discret">{formatDate(vue.date)}</p>

      <Carte titre="Où dorment les enfants ce soir">
        <ul className="enfants">
          {vue.enfants.map((e) => (
            <li key={e.enfantId}>
              <PastilleEnfant prenom={e.prenom} couleur={e.couleur} etat={e.etat} />
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
      </Carte>

      <Carte titre="Prochain transfert">
        {t ? (
          <dl className="transfert">
            <dt>Quand</dt>
            <dd>
              {t.aujourdhui ? "Aujourd'hui" : formatDate(t.date)} à {t.heure}
            </dd>
            <dt>Où</dt>
            <dd>{t.lieu}</dd>
            <dt>Dépose</dt>
            <dd>{t.depose}</dd>
            <dt>Récupère</dt>
            <dd>{t.recupere}</dd>
            <dt>Enfants</dt>
            <dd>{t.enfants.join(", ")}</dd>
          </dl>
        ) : (
          <p>Aucun transfert prévu.</p>
        )}
      </Carte>

      <Carte titre="Affaires à emmener">
        <ListeAffaires adulteId={adulteId} affaires={vue.affaires} />
      </Carte>
    </main>
  );
}
