# ADR 0018 — Carnet de passation et liste du transfert

Statut : accepté (2026-11-14)

## Décisions

Code dans `src/lib/transfert/` (domaine) et `src/lib/firestore/carnet-firestore.ts` (persistance). Aucun écran dans cette PR.

- **Carnet** : `DepotCarnet` (`ecrire`, `lire`, `effacer`), rattaché à un transfert ou à une date. Au plus 3 lignes, 80 caractères chacune : valeurs dans `ConfigurationCarnet` (défaut dans `carnet.ts`), pas dans la logique. Un dépassement est refusé, jamais tronqué en silence. Le premier à écrire est l'auteur ; seul lui modifie ou efface ; l'autre adulte lit. Hors famille : tout est refusé. Pour un transfert, `ecrireCarnetDuTransfert` exige en plus que l'auteur soit `deposeId` (celui qui remet).
- **Liste** : `listeDuTransfert` est pure. Elle part d'une `ConfigurationListe` (base commune, base par enfant, table motif de créneau vers éléments, avec fenêtre « jour », « lendemain » ou « les deux »), toute en données validées par `validerConfigurationListe`. `CONFIGURATION_LISTE_EXEMPLE` est une valeur de départ fictive. Identifiant d'élément : `enfantId|code`.
- **Coches** : `DepotCoches.definir(adulte, transfert, element, booleen)` fixe l'état au lieu de le basculer, donc idempotent (le premier cochage est conservé). Un document par transfert, mis à jour en transaction : des cochages simultanés ne se perdent pas.
- **Firestore** : `familles/{id}/carnets/{cle}` et `familles/{id}/coches/{transfertId}`, modèle lire puis écrire dans une transaction. Même suite de contrat (`contrats.ts`) sur mémoire, Firestore sur banque mémoire et émulateur (si `FIRESTORE_EMULATOR_HOST`).
- **Lot 1** : `vues/affaires.ts` (cases en `localStorage`) et ses tests sont inchangés. L'écran « Aujourd'hui » basculera sur `listeDuTransfert` et `DepotCoches` dans la PR d'interface.

## Limites

- La configuration de la liste n'a pas encore de stockage ni d'écran de saisie ; elle est passée en paramètre.
- Les coches ne vérifient pas que l'élément figure dans la liste du transfert (les orphelines sont ignorées par `avancement`).
- Pas de journal ni de notification pour le carnet et les coches.
