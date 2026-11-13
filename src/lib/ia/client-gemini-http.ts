import { analyserSortieDictee } from "./sortie-dictee";
import type { ClientGemini, DemandeDictee, DemandeRedaction, UsageIA } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface ReponseGemini {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const CONSIGNE_DICTEE = `Tu reçois la dictée vocale d'un parent. En un seul passage : transcris, corrige, puis range le contenu.
Réponds uniquement par un objet JSON de la forme {"transcription":string,"taches":[{"titre","assigneId?","echeance?"(AAAA-MM-JJ),"enfantId?","recurrence?"(quotidienne|hebdomadaire|mensuelle|annuelle)}],"rendezVous":[{"titre","debut"(AAAA-MM-JJTHH:MM),"fin?","lieu?","enfantIds?"}],"notes":[{"texte","enfantId?"}]}.
N'utilise que les identifiants présents dans le contexte familial. N'invente rien.`;

/** Implémentation réelle minimale (fetch). Non exécutée en test : les tests utilisent ClientGeminiFactice. */
export class ClientGeminiHttp implements ClientGemini {
  constructor(
    private readonly cle: string,
    private readonly modele: string,
    private readonly appeler: typeof fetch = fetch,
  ) {
    if (!cle) throw new Error("GEMINI_API_KEY manquante.");
  }

  private async generer(corps: unknown): Promise<{ texte: string; usage: UsageIA }> {
    const rep = await this.appeler(`${BASE}/${encodeURIComponent(this.modele)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.cle },
      body: JSON.stringify(corps),
    });
    if (!rep.ok) throw new Error(`Gemini a répondu ${rep.status}.`);
    const json = (await rep.json()) as ReponseGemini;
    const texte = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return {
      texte,
      usage: { jetonsEntree: json.usageMetadata?.promptTokenCount ?? 0, jetonsSortie: json.usageMetadata?.candidatesTokenCount ?? 0 },
    };
  }

  async traiterDictee(d: DemandeDictee) {
    const { texte, usage } = await this.generer({
      systemInstruction: { parts: [{ text: CONSIGNE_DICTEE }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: `Contexte familial :\n${d.contexteFamilial}\nAdulte : ${d.adulteId}\nMaintenant : ${d.maintenant.toISOString()} (fuseau Europe/Paris)` },
            { inlineData: { mimeType: d.audio.mimeType, data: Buffer.from(d.audio.octets).toString("base64") } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    });
    return { resultat: analyserSortieDictee(texte), usage };
  }

  async rediger(d: DemandeRedaction) {
    const { texte, usage } = await this.generer({
      contents: [{ role: "user", parts: [{ text: `${d.consigne}\n\nContexte :\n${d.contexte}` }] }],
    });
    return { texte: texte.trim(), usage };
  }
}
