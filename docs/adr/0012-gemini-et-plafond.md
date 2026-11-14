# ADR 0012 — Gemini et plafond de dépense

Statut : accepté (2026-11-14)

## Décisions

Code dans `src/lib/ia/`. Gemini est le seul fournisseur ; aucun appel réel n'est fait en test (doublure `ClientGeminiFactice`).

- **Interface `ClientGemini`** : `traiterDictee` (un seul appel : transcription, correction, rangement, rédaction) et `rediger` (textes courts). Le contexte familial est une chaîne fournie par l'appelant, lue en base, jamais écrite dans le code. Implémentation réelle `ClientGeminiHttp` (fetch, clé dans l'en-tête `x-goog-api-key`), non exécutée en test.
- **Configuration** (`configuration.ts`, seul endroit des valeurs par défaut) : `GEMINI_MODEL` (défaut gamme Pro), `GEMINI_API_KEY` (sans valeur dans `.env.example`), `IA_MAX_REQUETES_JOUR`, `IA_MAX_JETONS_ENTREE_JOUR`, `IA_MAX_JETONS_SORTIE_JOUR`, `IA_MAX_REQUETES_MOIS`, `IA_MAX_JETONS_ENTREE_MOIS`, `IA_MAX_JETONS_SORTIE_MOIS`, et `IA_MAX_OCTETS_AUDIO` (taille maximale de l'audio d'une dictée, en octets, 5 Mo par défaut ; refus 413 avant tout appel). Valeur vide ou invalide : défaut.
- **`SortieDictee`** : validateur écrit à la main (aucune dépendance). Rejette tout champ inconnu ou mal typé avec le chemin fautif ; tolère les clôtures markdown ; `verifierIdentifiants` contrôle les ids contre la `Famille`. `DemandeDictee` porte la `Famille` : tout `ClientGemini` (`ClientGeminiHttp` comme la doublure) appelle lui-même l'analyse et `verifierIdentifiants` avant de rendre une sortie, donc toute sortie rendue par `traiterDictee` est déjà vérifiée ; une sortie invalide lève `SortieDicteeInvalide` et n'aboutit jamais à une écriture. `sortieDicteeSure(brut, famille)` n'est que l'aide utilisée par le client HTTP.
- **Plafond** : `PlafondIA` compte requêtes et jetons par jour et par mois (fuseau Europe/Paris) dans un `StockageUsageIA` (mémoire en démonstration, Firestore en production : ADR 0019). `ClientGeminiPlafonne` réserve (1 requête + estimation de jetons) avant l'appel, lève `PlafondAtteint` (période, message en français) si un seuil serait dépassé, en annulant ce qui avait été réservé, puis remplace l'estimation par l'usage réel. Les compteurs séparent requêtes, jetons d'entrée et jetons de sortie (réflexion comprise, `thoughtsTokenCount`, avec `totalTokenCount` comme filet). Si `usageMetadata` manque, l'estimation réservée est conservée.
- **Appel facturé ou non** : un échec avant facturation (réseau, délai dépassé, réponse non 2xx) rend la réservation. Une réponse reçue mais refusée (JSON invalide, champ inconnu, identifiant inconnu) est facturée : `SortieDicteeInvalide` porte l'usage et l'enveloppe l'enregistre. Chaque appel HTTP a un délai maximal de 60 s (`AbortSignal.timeout`).

## Budget : 5 € par mois

Seuils par défaut : 30 requêtes/jour et 400/mois ; entrée 100 000 jetons/jour et 1 000 000/mois ; sortie (réflexion comprise) 20 000/jour et 200 000/mois.

Hypothèse de tarif, à vérifier par le propriétaire sur la grille officielle en vigueur (aucun prix n'est certain) : modèle de la gamme Pro, environ 1,25 $ par million de jetons d'entrée et 10 $ par million de jetons de sortie, réflexion facturée comme la sortie, 1 $ compté pour 1 €.

Calcul au plafond mensuel : 1 M × 1,25 + 0,2 M × 10 = 1,25 + 2,00 = 3,25 par mois, soit sous 5 €. Marge : même avec un tarif d'entrée (audio) doublé et un tarif de sortie majoré de 50 %, 2,50 + 3,00 = 5,50, à peine au-dessus : si le tarif réel s'écarte de l'hypothèse de ce facteur, abaisser les seuils via les variables d'environnement. Ces calculs valent tant que le plafond est respecté ; voir les limites.

## Limites

- Le plafond de jetons repose sur une estimation par appel (5 000 en entrée, 4 000 en sortie) : l'usage réel d'un appel peut la dépasser, le dépassement est compté et bloque les appels suivants. Le mois peut donc dépasser un seuil d'un appel au plus.
- Un appel en erreur 429 ou 5xx est rendu au compteur (rien n'est compté), alors que le fournisseur peut parfois avoir consommé du quota ou facturé : l'écart est négligeable mais non nul.
- Une réponse 200 dont l'enveloppe JSON elle-même est illisible est traitée comme un échec avant facturation.
- Le stockage mémoire (démonstration) est perdu au redémarrage ; en production les compteurs sont en Firestore (ADR 0019).
