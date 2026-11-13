# ADR 0012 — Gemini et plafond de dépense

Statut : accepté (2026-11-14)

## Décisions

Code dans `src/lib/ia/`. Gemini est le seul fournisseur ; aucun appel réel n'est fait en test (doublure `ClientGeminiFactice`).

- **Interface `ClientGemini`** : `traiterDictee` (un seul appel : transcription, correction, rangement, rédaction) et `rediger` (textes courts). Le contexte familial est une chaîne fournie par l'appelant, lue en base, jamais écrite dans le code. Implémentation réelle `ClientGeminiHttp` (fetch, clé dans l'en-tête `x-goog-api-key`), non exécutée en test.
- **Configuration** (`configuration.ts`, seul endroit des valeurs par défaut) : `GEMINI_MODEL` (défaut gamme Pro), `GEMINI_API_KEY` (sans valeur dans `.env.example`), `IA_MAX_REQUETES_JOUR`, `IA_MAX_JETONS_JOUR`, `IA_MAX_REQUETES_MOIS`, `IA_MAX_JETONS_MOIS`. Valeur vide ou invalide : défaut.
- **`SortieDictee`** : validateur écrit à la main (aucune dépendance). Rejette tout champ inconnu ou mal typé avec le chemin fautif ; tolère les clôtures markdown ; `verifierIdentifiants` contrôle les ids contre la `Famille`. `sortieDicteeSure(brut, famille)` est le seul point d'entrée pour obtenir une sortie à écrire : une sortie invalide lève `SortieDicteeInvalide` et n'aboutit jamais à une écriture.
- **Plafond** : `PlafondIA` compte requêtes et jetons par jour et par mois (fuseau Europe/Paris) dans un `StockageUsageIA` (mémoire pour l'instant). `ClientGeminiPlafonne` réserve (1 requête + estimation de jetons) avant l'appel, lève `PlafondAtteint` (période, message en français) si un seuil serait dépassé, en annulant ce qui avait été réservé, puis remplace l'estimation par l'usage réel. Un appel en erreur rend sa réservation.

## Limites

- Le plafond de jetons repose sur une estimation par appel : l'usage réel d'un appel peut dépasser l'estimation, le dépassement est compté et bloque les appels suivants.
- Le stockage mémoire est perdu au redémarrage ; une implémentation en base viendra avec la PR qui câble l'écran.
