# ADR 0019 — Persistance du lot 2 (tâches, notes, propositions, usage IA)

Statut : accepté (2026-11-14)

Contexte : en production la dictée répondait 503, car ses stockages n'existaient qu'en mémoire.

## Décisions

- **Un contrat par stockage**, exécuté contre la version mémoire, la version Firestore sur `BanqueMemoire` et, si `FIRESTORE_EMULATOR_HOST` est défini, l'émulateur (`npm run test:emulateur`) : `DepotTaches`, `NotesFamille`, `StockagePropositions`, `StockageUsageIA`.
- **`DepotTachesFirestore`** (`familles/{id}/taches`) : même modèle que `DepotFirestore`. Chaque opération charge la famille et les tâches dans une transaction, exécute `DepotTachesMemoire` (mêmes validations, mêmes règles de confidentialité du retard, `aujourdhui()` sur l'horloge injectée), puis n'écrit que les différences. Les ids sont des UUID : cela ferme l'oracle des ids séquentiels (`tache-1`, `tache-2`...). La version mémoire garde ses ids séquentiels (démonstration et tests).
- **`NotesFamilleFirestore`** (`familles/{id}/notes`) : ids triables par date, donc `lister` rend l'ordre d'ajout.
- **`StockageUsageIAFirestore`** (`familles/{id}/usageIA/{cle}`) : `ajouter` lit et écrit dans une seule transaction, donc des ajouts simultanés ne se perdent pas et le plafond tient entre instances.
- **`StockagePropositionsFirestore`** (`familles/{id}/propositionsDictee`) : `prendre` lit et supprime dans une seule transaction (usage unique atomique) ; une proposition expirée (15 min) est supprimée à la prise ; une proposition d'un autre auteur n'est pas retirée ; `ajouter` purge les expirées et borne à 50.
- **Composition de production** (`dictee/composition.ts`) : dépôts Firestore sur la banque unique du processus, `ClientGeminiHttp` TOUJOURS enveloppé par `ClientGeminiPlafonne` adossé au stockage d'usage Firestore. Le même client plafonné sert la rédaction du service de notifications. `GEMINI_API_KEY` absente : 503 « Dictée non configurée. » avant tout appel.
- **Notifications** : leurs stockages (abonnements, compteurs, file, préférences) ne sont pas dans cette PR ; ils restent provisoirement en mémoire dans la composition de production (sans abonnement connu, rien n'est envoyé ni rédigé). Remplacement prévu par une autre PR.

## Limites

- Chaque opération sur les tâches lit toute la collection de la famille : adapté à un volume familial.
- Pas de transaction entre dépôts lors d'une validation de dictée (inchangé, voir ADR 0016).
- Les compteurs d'usage vivent sous la famille configurée (`FAMILLE_ID`) : le plafond est donc par famille, ce qui correspond au déploiement à une famille.
