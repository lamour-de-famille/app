/**
 * RÉSERVÉ AU SERVEUR : porte la clé API. Ne jamais importer ce module depuis un composant client
 * ("use client") ni depuis du code livré au navigateur (un test le vérifie).
 */
import type { Famille } from "../domaine/types";
import { LIMITES_DICTEE, LIMITES_REDACTION, type LimitesAppel } from "./configuration";
import { analyserSortieDictee, SortieDicteeInvalide, verifierIdentifiants } from "./sortie-dictee";
import type { ClientGemini, DemandeDictee, DemandeRedaction, UsageIA } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface ReponseGemini {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
}

const CONSIGNE_DICTEE = `Tu reçois la dictée vocale d'un parent. En un seul passage : transcris, corrige, puis range le contenu.
Réponds uniquement par un objet JSON de la forme {"transcription":string,"taches":[{"titre","assigneId?","echeance?"(AAAA-MM-JJ),"enfantId?","recurrence?"(quotidienne|hebdomadaire|mensuelle|annuelle)}],"rendezVous":[{"titre","debut"(AAAA-MM-JJTHH:MM),"fin?","lieu?","enfantIds?"}],"notes":[{"texte","enfantId?"}]}.
N'utilise que les identifiants présents dans le contexte familial. N'invente rien.`;

/** Délai maximal d'un appel (millisecondes). */
export const DELAI_APPEL_MS = 60_000;

/**
 * Usage facturé d'après usageMetadata. La réflexion compte avec la sortie ; totalTokenCount sert de filet.
 * Rend undefined si le fournisseur n'a rien indiqué (l'estimation réservée est alors conservée).
 */
export function usageDepuisMetadonnees(m: ReponseGemini["usageMetadata"]): UsageIA | undefined {
  if (!m) return undefined;
  const entree = m.promptTokenCount;
  if (entree === undefined && m.candidatesTokenCount === undefined && m.thoughtsTokenCount === undefined && m.totalTokenCount === undefined) return undefined;
  const sortie = (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0);
  const deduit = m.totalTokenCount !== undefined && entree !== undefined ? m.totalTokenCount - entree : 0;
  return { jetonsEntree: entree ?? 0, jetonsSortie: Math.max(sortie, deduit) };
}

function configGeneration(l: LimitesAppel) {
  return { maxOutputTokens: l.maxOutputTokens, thinkingConfig: { thinkingBudget: l.thinkingBudget } };
}

function contexteFamilial(f: Famille): string {
  const adultes = f.adultes.map((a) => `${a.id} (${a.prenom})`).join(", ");
  const enfants = f.enfants.map((e) => `${e.id} (${e.prenom})`).join(", ");
  return `Adultes : ${adultes}
Enfants : ${enfants}`;
}

/** Implémentation réelle (fetch). Les tests lui passent un fetch factice : aucun appel réel. */
export class ClientGeminiHttp implements ClientGemini {
  constructor(
    private readonly cle: string,
    private readonly modele: string,
    private readonly appeler: typeof fetch = fetch,
    private readonly delaiMs: number = DELAI_APPEL_MS,
    private readonly limites: { dictee: LimitesAppel; redaction: LimitesAppel } = { dictee: LIMITES_DICTEE, redaction: LIMITES_REDACTION },
  ) {
    if (!cle) throw new Error("GEMINI_API_KEY manquante.");
  }

  private async generer(corps: unknown): Promise<{ texte: string; usage: UsageIA | undefined }> {
    const rep = await this.appeler(`${BASE}/${encodeURIComponent(this.modele)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.cle },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(this.delaiMs),
    });
    if (!rep.ok) throw new Error(`Gemini a répondu ${rep.status}.`);
    const json = (await rep.json()) as ReponseGemini;
    const texte = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return { texte, usage: usageDepuisMetadonnees(json.usageMetadata) };
  }

  async traiterDictee(d: DemandeDictee) {
    const { texte, usage } = await this.generer({
      systemInstruction: { parts: [{ text: CONSIGNE_DICTEE }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: `Contexte familial :\n${contexteFamilial(d.famille)}\nAdulte : ${d.adulteId}\nMaintenant : ${d.maintenant.toISOString()} (fuseau Europe/Paris)` },
            { inlineData: { mimeType: d.audio.mimeType, data: Buffer.from(d.audio.octets).toString("base64") } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", ...configGeneration(this.limites.dictee) },
    });
    // Réponse reçue donc facturée : une sortie refusée porte l'usage pour que le plafond le compte.
    try {
      const resultat = analyserSortieDictee(texte);
      verifierIdentifiants(resultat, d.famille);
      return { resultat, usage };
    } catch (e) {
      if (e instanceof SortieDicteeInvalide) throw new SortieDicteeInvalide(e.problemes, usage);
      throw e;
    }
  }

  async rediger(d: DemandeRedaction) {
    const { texte, usage } = await this.generer({
      generationConfig: configGeneration(this.limites.redaction),
      contents: [{ role: "user", parts: [{ text: `${d.consigne}\n\nContexte :\n${d.contexte}` }] }],
    });
    return { texte: texte.trim(), usage };
  }
}
