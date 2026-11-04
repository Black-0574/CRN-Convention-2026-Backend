# Boutique de la Convention — intégrée au site et au back-office

La boutique fait partie du site officiel : elle vit sous **`crn-convention2026.events/boutique`**
(pages dans `src/pages/boutique/` du site) et se gère dans **le back-office existant**
(`admin.crn-convention2026.events`, Payload + SQLite chez Hostinger, groupes « Boutique · … »).
Plan validé : `C:\Users\Mael\.claude\plans\jaunty-cuddling-kahn.md`. Règles : `CLAUDE.md`.

| Où | Rôle |
| --- | --- |
| `backend/src/boutique/domaine/` | Cœur métier pur : paliers tarifaires, montants, quotas, jetons de billet, droits d’accès, paiements (Vitest, 42 tests) |
| `backend/src/boutique/collections/` | Catalogue, ventes, contrôle d’accès, réglages de la boutique |
| `backend/src/boutique/lib/` | Réservations atomiques (SQL), émission des billets (PDF, QR signé), e-mails, paiement, scan, tableau de bord |
| `backend/src/boutique/endpoints.ts` | API `/api/boutique/…` et `/api/mis-en-avant` |
| `backend/src/app/(agents)/scan/` | Contrôle d’accès des agents COM Boutique : `admin…/scan` |
| `src/pages/boutique/` (site) | Catalogue, fiches produits, commande en 3 étapes, suivi, CGV |

Les pages catalogue et produits du site sont **statiques**, générées au build depuis l’API ; toute
modification du catalogue dans le back-office republie le site. Le panier, la commande, le
paiement et le suivi appellent l’API du back-office depuis le navigateur (`PUBLIC_BOUTIQUE_API_URL`).

## Lancer en local

```bash
npm --prefix backend run dev     # back-office + API boutique : http://localhost:3001/admin
npm run dev                      # site : http://localhost:4321/boutique
```

Le schéma est créé au démarrage du back-office, puis le catalogue initial est importé
(`seed.ts`, une seule fois). Variables locales (`backend/.env`, jamais commité) : `BILLETS_SECRET`,
`LIENS_SECRET`, `PAIEMENT_PRESTATAIRE=bac-a-sable`, `PAIEMENT_BAC_A_SABLE_SECRET`,
`PUBLIC_SERVER_URL`, `BOUTIQUE_DEMO=1`, et facultativement les comptes de démonstration
`BOUTIQUE_ADMIN_*` / `BOUTIQUE_AGENT_*`. Site : `PUBLIC_BOUTIQUE_API_URL=http://localhost:3001`.

`BOUTIQUE_DEMO=1` (local uniquement, refusé en production) affiche aussi les pass au tarif non
validé, marqués « Aperçu », avec des capacités et stocks de démonstration. Les paiements passent
par le prestataire « bac à sable » (« Valider » / « Refuser » à la place du téléphone). Les e-mails
ne partent pas : ils sont écrits dans `backend/.courriels/` et listés sur la page de suivi.

## Tests

```bash
npm --prefix backend run test:boutique     # cœur métier (42 tests)
npm --prefix backend run test:concurrence  # 200 commandes simultanées sur 50 places : 50 acceptées
npm --prefix backend run test:scan         # double passage refusé, QR falsifié refusé, scans simultanés
E2E_BOUTIQUE=1 npx playwright test tests/e2e/boutique-achat.spec.ts   # achat complet à 360 × 740
```

## Ce qui est vendu

- **En vente** : prix validés pour le site (`docs/donnees-reference.md`) — 7 tickets à l’unité,
  tee-shirt officiel (S à XXL), pagne officiel.
- **« Prix à valider »** (jamais en vente en production) : Pass Partenaire Or, Pass Grand
  Partenaire Diamant, Pass Convention Intégral (paliers), Pass Génération, Pass Génération Plus —
  en attente de la grille validée par le CRN.
- **Capacités et stocks** : inconnus → vides en production (quota vide = ventes bloquées ; stock
  vide = non suivi, signalé au tableau de bord).

## Garanties

- **Aucune survente** : chaque stock et quota est réservé par une instruction SQL conditionnelle
  unique (SQLite sérialise les écritures), pendant 15 minutes, puis vendu ou libéré.
- **Paliers tarifaires** basculant à 00h00, heure de Libreville ; prix garanti pendant la
  réservation.
- **Billets** : un par titulaire, QR = jeton aléatoire signé (HMAC), aucune donnée personnelle ;
  droits d’accès par séance ; second scan refusé et journalisé.
- **Paiements** derrière l’interface `PaymentProvider` ; webhooks signés, idempotents ; argent
  reçu après expiration → commande « à vérifier ».
- **Back-office** : rôles nominatifs (administrateur, éditeur, catalogue, COM Boutique,
  comptabilité), journal des actions, tableau des ventes, exports CSV.

## Reste à raccorder avant la mise en production (questions au CRN)

Agrégateur Mobile Money (identifiants), prestataire d’e-mail, grille tarifaire validée,
capacités et stocks, lieu de retrait, CGV, double authentification devant `/admin`.
