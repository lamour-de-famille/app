# ADR 0016 — Dictée (service et routes)

Statut : accepté (2026-11-14)

## Décisions

- **Deux temps, validation obligatoire côté serveur.** `DicteeService.proposer` appelle Gemini (client plafonné, famille lue en base par `DepotFamille.lireFamille`) et range la sortie en proposition ; il n'écrit rien. `valider` est la seule porte d'écriture. Sans appel à `valider` par l'auteur, rien n'est écrit.
- **Proposition gardée côté serveur** (`StockagePropositions`, mémoire) sous un identifiant `crypto.randomUUID()`, lié à l'auteur, valable 15 minutes, **à usage unique** : `prendre` la lit et la retire de façon atomique. Inconnue, expirée, déjà validée ou d'un autre auteur : même erreur `PropositionIntrouvable` (404), sans indication. Un autre auteur ne la brûle pas. Un choix invalide la remet en place pour correction. Le client ne renvoie que des indices ou des versions modifiées, jamais le contenu d'origine.
- **Versions modifiées** : revalidées par `validerSortieDictee` (champs inconnus refusés) puis `verifierIdentifiants` contre la famille lue en base. Au plus 50 éléments par catégorie.
- **Confidentialité** : la demande à Gemini ne contient que l'audio et la famille, jamais une tâche existante ; la proposition ne contient que la dictée de son auteur. Le retard de l'autre adulte n'est donc ni lu ni exposé. L'auteur vient de la session, jamais du corps.
- **Écritures** : tâches via `DepotTaches` (sans responsable dicté : l'auteur ; annuelle : tous les 12 mois, car le domaine n'a pas d'annuelle ; récurrence sans échéance ignorée). Rendez-vous via `DepotFamille.enregistrerCreneau`, un créneau par enfant ; fin absente : une heure après le début, fin hors du jour : 23:59. **Rendez-vous sans enfant** : les créneaux sont par enfant, donc il est gardé comme note datée (annoncé en avertissement dès la proposition). Notes : petit stockage `NotesFamille` derrière interface (mémoire), le plus simple ; l'adaptateur Firestore viendra avec l'écran de notes.
- **Notification** : après écriture, un seul message à l'autre adulte, et seulement pour les tâches qui lui sont confiées (sujet sobre sans titre : « Alex vous a confié une tâche. »). Le plafond de 10 par jour reste dans `ServiceNotifications`, non contourné. Échec de notification ou de synchro : les écritures restent, un avertissement est rendu.
- **Synchro** injectable : `synchroApresModification` (Agenda, si des créneaux sont écrits) et `synchroTaches` (Tasks, optionnel, autre PR).
- **Bornes de l'appel Gemini** : `maxOutputTokens` (4000, réflexion comprise, aligné sur la réservation du plafond) et `thinkingConfig.thinkingBudget` (1024) pour la dictée, bornes plus basses pour la rédaction. Audio : 5 Mo au plus par défaut (`IA_MAX_OCTETS_AUDIO`), refus propre (413) avant tout appel, corps lu en flux et coupé au-delà.
- **Serveur seulement** : commentaire explicite sur le client HTTP, le service et les routes, et un test qui vérifie qu'aucun composant `"use client"` ne les importe (le paquet `server-only` n'est pas ajouté pour ne pas toucher aux dépendances).

## Routes

`POST /api/dictee` (corps audio brut, `Content-Type` = type audio) et `POST /api/dictee/valider` (JSON `{propositionId, retenus}`). Session vérifiée avant toute lecture en base (401), origine croisée refusée (403), `PlafondAtteint` : 429 avec message français, sortie invalide : 502 sans rien écrire, non configuré : 503.

## Limites connues

- Stockages en mémoire (propositions, notes) : adaptateurs Firestore à venir. Un redémarrage perd les propositions en attente (sans conséquence : rien n'était écrit).
- Un échec d'écriture au milieu d'une validation laisse les écritures déjà faites (pas de transaction entre dépôts) ; la proposition est consommée.
- En production, l'assemblage (`composition.ts`) ne câble que la démonstration, avec des doublures ; tant que les adaptateurs Firestore des tâches, notes, abonnements et compteurs IA n'existent pas, la route répond 503.
