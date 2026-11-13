# ADR 0007 — Vacances scolaires

Statut : accepté (2026-11-13)

Les vacances viennent du jeu ouvert « fr-en-calendrier-scolaire » (data.education.gouv.fr, API Explore v2.1, sans clé). Le client est derrière l'interface `ClientVacances` ; en test, une doublure lit une fixture JSON locale et le `fetch` du client réel est simulé : aucun appel réseau.

- Académie, zone et année scolaire sont en configuration (`VACANCES_ACADEMIE`, `VACANCES_ZONE`, `VACANCES_ANNEE_SCOLAIRE`), vides par défaut = pas de filtre.
- La normalisation est pure : dates converties en jour civil de Paris (`AAAA-MM-JJ`), enregistrements invalides ou « Enseignants » ignorés, doublons fusionnés, tri par début.
- Les dates sont les dates officielles brutes : le choix « jour officiel ou lendemain » (reprise, veille) appartient au moteur de règles.
- Pagination : pages de 100, au plus 20 pages, jamais offset + limit > 10 000. Si la limite est atteinte alors qu'il reste des résultats (`total_count`), le client lève `ErreurVacances` au lieu de tronquer en silence ; un filtre d'année scolaire est recommandé.
- Les valeurs de filtre contenant `"` ou `\` sont rejetées en configuration (`ErreurVacances`) : l'échappement ODSQL n'est pas supposé.
- Limite connue : le dédoublonnage ignore l'académie. Deux périodes de mêmes dates et même libellé issues d'académies différentes sont fusionnées en une seule ; filtrer par académie si elles divergent.
- Une panne réseau lève `ErreurVacances` ; l'appelant garde les dernières périodes connues.
