"use server";
import { redirect } from "next/navigation";
import { ErreurDomaine } from "@/lib/domaine/depot";
import { construireDemande } from "@/lib/vues/echange";
import { obtenirDepot } from "@/lib/acces/depot";
import { exigerAdulte } from "@/lib/acces/serveur";

function aujourdhuiLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const texte = (f: FormData, nom: string) => {
  const v = f.get(nom);
  return typeof v === "string" ? v : "";
};

function retour(demo: string | null, mois: string, resultat: string): never {
  const q = new URLSearchParams({ resultat });
  if (demo) q.set("adulte", demo);
  if (/^\d{4}-\d{2}$/.test(mois)) q.set("mois", mois);
  redirect(`/planning?${q.toString()}`);
}

export async function repondreDemande(f: FormData) {
  const { adulteId: adulte, demo } = await exigerAdulte(aujourdhuiLocal(), texte(f, "adulte"));
  const marque = demo ? adulte : null;
  const mois = texte(f, "mois");
  const reponse = texte(f, "reponse");
  if (reponse !== "acceptee" && reponse !== "refusee") retour(marque, mois, "erreur-reponse");
  let issue: string;
  try {
    const depot = await obtenirDepot(aujourdhuiLocal());
    await depot.repondreEchange(adulte, texte(f, "demande"), reponse as "acceptee" | "refusee");
    issue = reponse as string;
  } catch (e) {
    issue = e instanceof ErreurDomaine ? "erreur-reponse" : "erreur";
  }
  retour(marque, mois, issue);
}

export async function proposerEchange(f: FormData) {
  const { adulteId: adulte, demo } = await exigerAdulte(aujourdhuiLocal(), texte(f, "adulte"));
  const marque = demo ? adulte : null;
  const mois = texte(f, "mois");
  let issue = "erreur";
  try {
    const depot = await obtenirDepot(aujourdhuiLocal());
    const famille = await depot.lireFamille();
    const r = construireDemande({
      famille,
      adulteId: adulte,
      du: texte(f, "du"),
      au: texte(f, "au"),
      enfantIds: f.getAll("enfant").filter((v): v is string => typeof v === "string"),
      garde: texte(f, "garde"),
    });
    if (r.ok) {
      await depot.proposerEchange(adulte, r.demande);
      issue = "proposee";
    } else {
      issue = r.code;
    }
  } catch (e) {
    issue = e instanceof ErreurDomaine ? "invalide" : "erreur";
  }
  retour(marque, mois, issue);
}
