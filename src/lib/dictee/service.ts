/**
 * Service de dictée : RÉSERVÉ AU SERVEUR (il pilote le client Gemini). Ne jamais l'importer côté client.
 *
 * `proposer` ne fait aucune écriture ; `valider` est la seule porte d'écriture et ne porte que sur une
 * proposition produite par le serveur, pour son auteur, une seule fois (ADR 0016).
 */
import { ErreurDomaine, type DepotFamille } from "../domaine/depot";
import type { Famille } from "../domaine/types";
import { MAX_OCTETS_AUDIO_PAR_DEFAUT } from "../ia/configuration";
import { SortieDicteeInvalide, validerSortieDictee, verifierIdentifiants } from "../ia/sortie-dictee";
import type { ClientGemini, NoteDictee, RendezVousDictee, SortieDictee, TacheDictee } from "../ia/types";
import type { DemandeNotification, ResultatNotification } from "../notifications/types";
import type { DepotTaches } from "../taches/depot";
import { avertissementsDe, versCreneaux, versNote, versNouvelleTache } from "./conversion";
import type { NotesFamille } from "./notes";
import type { StockagePropositions } from "./stockage-propositions";
import { AudioInvalide, ChoixInvalide, PropositionIntrouvable, type PropositionDictee, type Retenus, type ResultatValidation } from "./types";

/** Durée de vie d'une proposition non validée. */
export const DUREE_PROPOSITION_MS = 15 * 60 * 1000;
/** Éléments retenus par catégorie, au plus (borne les versions modifiées). */
export const MAX_RETENUS_PAR_CATEGORIE = 50;

const RE_MIME_AUDIO = /^audio\/[a-z0-9][a-z0-9.+-]*$/;

export interface DependancesDictee {
  depotFamille: DepotFamille;
  depotTaches: DepotTaches;
  notes: NotesFamille;
  propositions: StockagePropositions;
  /** Client déjà plafonné (ClientGeminiPlafonne). */
  gemini: ClientGemini;
  notifications: { notifier(demande: DemandeNotification): Promise<ResultatNotification> };
  /** Synchro Agenda après modification des créneaux (synchroApresModification). */
  synchroApresModification?: (auteurId: string) => Promise<void>;
  /** Hook optionnel pour Google Tasks, après modification des tâches. */
  synchroTaches?: (auteurId: string) => Promise<void>;
  maxOctetsAudio?: number;
  dureePropositionMs?: number;
  maintenant?: () => Date;
  genererId?: () => string;
}

/** Corps de la proposition : valide la sortie et les identifiants contre la famille lue en base. */
function controler(s: { taches: TacheDictee[]; rendezVous: RendezVousDictee[]; notes: NoteDictee[]; transcription?: string }, famille: Famille): SortieDictee {
  const propre = validerSortieDictee({ transcription: s.transcription ?? "", taches: s.taches, rendezVous: s.rendezVous, notes: s.notes });
  verifierIdentifiants(propre, famille);
  return propre;
}

export class DicteeService {
  private readonly maintenant: () => Date;
  private readonly maxOctets: number;
  private readonly duree: number;

  constructor(private readonly d: DependancesDictee) {
    this.maintenant = d.maintenant ?? (() => new Date());
    this.maxOctets = d.maxOctetsAudio ?? MAX_OCTETS_AUDIO_PAR_DEFAUT;
    this.duree = d.dureePropositionMs ?? DUREE_PROPOSITION_MS;
  }

  private verifierAudio(audio: { octets: Uint8Array; mimeType: string }): { octets: Uint8Array; mimeType: string } {
    if (audio.octets.byteLength === 0) throw new AudioInvalide("vide", "L'enregistrement est vide.");
    if (audio.octets.byteLength > this.maxOctets) {
      throw new AudioInvalide("trop_gros", `L'enregistrement est trop long (maximum ${Math.floor(this.maxOctets / (1024 * 1024))} Mo).`);
    }
    const mimeType = audio.mimeType.split(";")[0]!.trim().toLowerCase();
    if (!RE_MIME_AUDIO.test(mimeType)) throw new AudioInvalide("type", "Le format de l'enregistrement n'est pas reconnu.");
    return { octets: audio.octets, mimeType };
  }

  private async lireFamilleEtAuteur(auteurId: string): Promise<Famille> {
    const famille = await this.d.depotFamille.lireFamille();
    if (!famille.adultes.some((a) => a.id === auteurId)) throw new ErreurDomaine(`Auteur inconnu : ${auteurId}`);
    return famille;
  }

  /**
   * Appelle Gemini (plafonné) et range la sortie en proposition. AUCUNE écriture dans le domaine.
   * Lève PlafondAtteint, SortieDicteeInvalide (rien n'est retenu) ou AudioInvalide.
   * La demande à Gemini ne contient que l'audio et la famille : aucune tâche existante (le retard reste privé).
   */
  async proposer(p: { auteurId: string; audio: { octets: Uint8Array; mimeType: string } }): Promise<PropositionDictee> {
    const audio = this.verifierAudio(p.audio);
    const famille = await this.lireFamilleEtAuteur(p.auteurId);
    const maintenant = this.maintenant();
    const { resultat } = await this.d.gemini.traiterDictee({ audio, famille, maintenant, adulteId: p.auteurId });
    const sortie = controler(resultat, famille);
    const id = this.d.genererId?.() ?? crypto.randomUUID();
    const expireLe = maintenant.getTime() + this.duree;
    const avertissements = avertissementsDe(sortie);
    await this.d.propositions.ajouter({ id, auteurId: p.auteurId, expireLe, sortie, avertissements });
    return { id, transcription: sortie.transcription, taches: sortie.taches, rendezVous: sortie.rendezVous, notes: sortie.notes, avertissements, expireLe: new Date(expireLe).toISOString() };
  }

  /** Résout indices et versions modifiées ; les versions modifiées repassent par le même schéma et les mêmes vérifications d'identifiants. */
  private retenir(sortie: SortieDictee, retenus: Retenus, famille: Famille): { taches: TacheDictee[]; rendezVous: RendezVousDictee[]; notes: NoteDictee[] } {
    const problemes: string[] = [];
    const resoudre = <T>(nom: string, choix: unknown, source: T[]): T[] => {
      if (choix === undefined) return [];
      if (!Array.isArray(choix)) {
        problemes.push(`${nom} doit être une liste`);
        return [];
      }
      if (choix.length > MAX_RETENUS_PAR_CATEGORIE) {
        problemes.push(`${nom} : trop d'éléments`);
        return [];
      }
      const vus = new Set<number>();
      const sortieListe: T[] = [];
      choix.forEach((c, i) => {
        if (typeof c === "number") {
          if (!Number.isInteger(c) || c < 0 || c >= source.length) problemes.push(`${nom}[${i}] : indice inconnu`);
          else if (!vus.has(c)) {
            vus.add(c);
            sortieListe.push(source[c]!);
          }
        } else sortieListe.push(c as T);
      });
      return sortieListe;
    };
    const taches = resoudre("taches", retenus.taches, sortie.taches);
    const rendezVous = resoudre("rendezVous", retenus.rendezVous, sortie.rendezVous);
    const notes = resoudre("notes", retenus.notes, sortie.notes);
    if (problemes.length > 0) throw new ChoixInvalide(problemes);
    try {
      const propre = controler({ taches, rendezVous, notes }, famille);
      return { taches: propre.taches, rendezVous: propre.rendezVous, notes: propre.notes };
    } catch (e) {
      if (e instanceof SortieDicteeInvalide) throw new ChoixInvalide(e.problemes);
      throw e;
    }
  }

  /**
   * Seule porte d'écriture. Tout est vérifié AVANT de consommer la proposition (un choix invalide ne la brûle pas) ;
   * elle est ensuite retirée de façon atomique : un second appel, un autre auteur ou une expiration lèvent
   * PropositionIntrouvable. Les erreurs de synchro et de notification n'annulent pas les écritures : elles
   * sont rendues en avertissements.
   */
  async valider(p: { auteurId: string; propositionId: string; retenus: Retenus }): Promise<ResultatValidation> {
    const famille = await this.lireFamilleEtAuteur(p.auteurId);
    if (typeof p.retenus !== "object" || p.retenus === null || Array.isArray(p.retenus)) throw new ChoixInvalide(["retenus doit être un objet"]);
    const maintenant = this.maintenant();
    // Prise atomique (usage unique) ; si le choix est invalide, elle est remise pour que l'auteur corrige.
    const stockee = await this.d.propositions.prendre(p.propositionId, p.auteurId, maintenant);
    if (!stockee) throw new PropositionIntrouvable();
    let choix;
    try {
      choix = this.retenir(stockee.sortie, p.retenus, famille);
    } catch (e) {
      await this.d.propositions.ajouter(stockee);
      throw e;
    }

    const auteurId = p.auteurId;
    const avertissements: string[] = [];
    let nbTaches = 0;
    let nbCreneaux = 0;
    let nbNotes = 0;
    let enNote = 0;
    const pourAutre: string[] = [];
    const autre = famille.adultes.find((a) => a.id !== auteurId)!;
    const moi = famille.adultes.find((a) => a.id === auteurId)!;

    for (const t of choix.taches) {
      const nouvelle = versNouvelleTache(t, auteurId);
      await this.d.depotTaches.enregistrer(auteurId, nouvelle);
      nbTaches++;
      if (nouvelle.assigneId === autre.id) pourAutre.push(nouvelle.titre);
    }
    for (const r of choix.rendezVous) {
      const creneaux = versCreneaux(r);
      for (const c of creneaux) await this.d.depotFamille.enregistrerCreneau(auteurId, c);
      nbCreneaux += creneaux.length;
      if (creneaux.length === 0) {
        await this.d.notes.ajouter(auteurId, versNote(r));
        enNote++;
      }
    }
    for (const n of choix.notes) {
      await this.d.notes.ajouter(auteurId, n);
      nbNotes++;
    }

    if (nbCreneaux > 0) await this.appeler(this.d.synchroApresModification, auteurId, "La synchronisation de l'agenda a échoué ; elle sera reprise.", avertissements);
    if (nbTaches > 0) await this.appeler(this.d.synchroTaches, auteurId, "La synchronisation des tâches a échoué ; elle sera reprise.", avertissements);

    // Seules les tâches confiées à l'autre adulte le concernent ; un seul message, sujet sobre (sans titre).
    let notifie = false;
    if (pourAutre.length > 0) {
      const sujet = `${moi.prenom} vous a confié ${pourAutre.length === 1 ? "une tâche" : `${pourAutre.length} tâches`}.`;
      try {
        const r = await this.d.notifications.notifier({ destinataireId: autre.id, sujet });
        notifie = r.statut === "envoyee" || r.statut === "regroupee";
      } catch {
        avertissements.push("La notification n'a pas pu être envoyée.");
      }
    }
    return { taches: nbTaches, creneaux: nbCreneaux, notes: nbNotes, rendezVousEnNote: enNote, notifie, avertissements };
  }

  private async appeler(f: ((auteurId: string) => Promise<void>) | undefined, auteurId: string, message: string, avertissements: string[]) {
    if (!f) return;
    try {
      await f(auteurId);
    } catch {
      avertissements.push(message);
    }
  }
}
