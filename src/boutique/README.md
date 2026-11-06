# Boutique de la Convention — intégrée au site et au back-office

La boutique fait partie du site officiel : elle vit sous **`crn-convention2026.events/boutique`**
(pages dans `src/pages/boutique/` du site) et se gère dans **le back-office existant**
(`admin.crn-convention2026.events`, Payload + SQLite chez Hostinger, groupes « Boutique · … »).
Plan validé : `C:\Users\Mael\.claude\plans\jaunty-cuddling-kahn.md`. Règles : `CLAUDE.md`.

| Où | Rôle |
| --- | --- |
| `backend/src/boutique/domaine/` | Cœur métier pur : paliers tarifaires, montants, quotas, jetons de billet, droits d’accès, paiements (Vitest, 44 tests) |
| `backend/src/boutique/collections/` | Catalogue, ventes, contrôle d’accès, logistique (églises du réseau), réglages de la boutique |
| `backend/src/boutique/lib/` | Réservations atomiques (SQL), émission des billets (PDF, QR signé), e-mails, paiement, scan, tableau de bord |
| `backend/src/boutique/endpoints.ts` | API `/api/boutique/…` et `/api/mis-en-avant` |
| `backend/src/app/(agents)/scan/` | Contrôle d’accès des agents COM Boutique : `admin…/scan` (séance, site et heure) |
| `backend/src/app/(agents)/paiement-simule/` | Page de paiement simulée de l’agrégateur (local uniquement) |
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
par le prestataire « bac à sable » : le client est redirigé vers une page de paiement simulée
(`/paiement-simule` du back-office) où il choisit Mobile Money (pays, opérateur) ou carte, puis
valide ou refuse ; il revient ensuite au suivi de sa commande. En démonstration, deux églises
fictives (Libreville, Paris) et la livraison à domicile à Libreville sont créées, signalées comme
telles. Les e-mails
ne partent pas : ils sont écrits dans `backend/.courriels/` et listés sur la page de suivi.

## Tests

```bash
npm --prefix backend run test:boutique     # cœur métier (68 tests, dont l’adaptateur SasPay)
npm --prefix backend run test:concurrence  # 200 commandes simultanées sur 50 places : 50 acceptées
npm --prefix backend run test:scan         # double passage refusé, QR falsifié refusé, scans simultanés
npm --prefix backend run test:saspay       # paiement SasPay de bout en bout contre un faux SasPay
E2E_BOUTIQUE=1 npx playwright test tests/e2e/boutique-achat.spec.ts   # achats complets à 360 × 740
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
- **Pass et tickets toujours nominatifs** : un titulaire et un QR code par exemplaire, émis dès le
  paiement (jeton aléatoire signé HMAC, aucune donnée personnelle) ; un droit par séance et par
  site, consommé au scan ; second scan refusé et journalisé. Un pass ne peut être mis en vente
  sans ouvrir au moins une séance.
- **Livraison des articles et kits** : église du réseau (au Gabon ou hors du Gabon, liste et frais
  saisis par le CRN), domicile ou lieu de travail à Libreville (exceptionnel, activé et tarifé par
  le CRN), ou retrait sur le lieu de la Convention ; frais ajoutés au total ; suivi des remises dans
  « Boutique · Logistique ».
- **Paiements** derrière l’interface `PaymentProvider`, prévue pour un agrégateur multi-pays :
  Mobile Money des différents opérateurs et carte bancaire, choisis par le client sur la page
  sécurisée de l’agrégateur (aucun opérateur codé en dur) ; moyen et détail enregistrés sur la
  commande ; webhooks signés, idempotents ; argent reçu après expiration → commande « à vérifier ».
- **Back-office** : rôles nominatifs (administrateur, éditeur, catalogue, COM Boutique,
  comptabilité), journal des actions, tableau des ventes, exports CSV.

## Paiement SasPay (agrégateur retenu le 6 novembre 2026)

`domaine/src/saspay.ts`, branché par `PAIEMENT_PRESTATAIRE=saspay` (variables : `backend/.env.example`).

- **Checkout hébergé** : `POST /checkout-sessions/` en XAF, montant de la commande, page SasPay où
  le client choisit son pays, son réseau ou la carte ; la session expire avec la réservation des
  places ; retour automatique au suivi de commande après un paiement réussi.
- **Webhook** `https://admin.crn-convention2026.events/api/boutique/paiements/saspay/webhook`
  (à créer dans le tableau de bord SasPay : événements `transaction.success`, `transaction.failed`,
  `transaction.cancelled`) : signature HMAC et horodatage (5 min) vérifiés ; le corps ne porte pas
  la référence de la commande, il déclenche donc la relecture du statut des commandes SasPay en
  attente (`GET /checkout-sessions/{id}/status/`, revérifié par SasPay chez l'opérateur). Réponse
  immédiate, traitement en arrière-plan et en file (SasPay coupe à 15 s).
- **Vérifier avant de livrer** : une commande ne passe « payée » (billets émis) que si
  `GET /payments/{id}/verify/` renvoie `SUCCESS` ; montant débité au client et net reçu notés dans
  le détail du paiement de la commande (comptabilité).
- **Confirmation rapide côté client** : la page de suivi interroge le back-office toutes les 3 s ;
  pour une commande en attente, chaque interrogation relit SasPay (au plus une fois toutes les
  5 s par commande, réponse bornée à 8 s). La commande passe « payée » dès que SasPay confirme,
  sans attendre le webhook ni la relecture périodique (`npm run test:saspay`, vérifications 10-11).
- **Filet de sécurité** : même relecture toutes les 2 minutes (webhook perdu ou pas encore créé),
  commandes expirées depuis moins de 24 h comprises (paiement tardif → « à vérifier ») ; arrêt au
  premier `429` (limite de débit), reprise au passage suivant.
- **Contrôle de configuration** : `npm --prefix backend run saspay:verifier` (variables, clé acceptée,
  réseaux ouverts au Gabon et plafonds par paiement, webhook déclaré, abonnements et doublons,
  secrets des billets) ; n'affiche jamais la clé ni les secrets.
- **Mode de frais** : le `fee_charge_mode` envoyé à la création de session est ignoré par SasPay
  sans l'option « Autoriser le choix du mode de frais par l'API ». Seul le réglage du compte fait
  foi : tableau de bord SasPay → Paramètres → Frais → Encaissements (« Déduits » : le client paie
  le prix affiché, décision du CRN du 6 novembre 2026, réglé le jour même). Aucune route de l'API
  ne donne ce réglage (le `fee_charge_mode` de `/pricing/my-rates/` est celui du barème) : le
  contrôle le rappelle, la preuve est un paiement dont le montant débité égale le prix.
- **Produits réservés aux tests** (case « Réservé aux tests » du produit) : jamais listés dans la
  boutique ni mis en avant, achetables par leur lien direct même ventes fermées (tout autre produit
  reste refusé). Pass, ticket et article à 200 F CFA créés une seule fois au démarrage
  (`src/boutique/produits-test.ts`), en ligne depuis le 6 novembre 2026 pour les tests des équipes :
  `/boutique/produits/test-pass-200`, `test-ticket-200`, `test-article-200` (exclus par robots.txt).
  À retirer avant l'ouverture des ventes : décocher « Actif » dans l'admin (ils ne reviennent pas).
  En local : `npm --prefix backend run produits-test` (`-- --retirer` pour les retirer).
- **Vérifié contre le vrai SasPay** le 6 novembre 2026, depuis un poste local avec la clé de
  production : produits de test à 200 F CFA, session créée, paiement Mobile Money
  réussi, commande payée à la relecture suivante, billet PDF et e-mail générés, webhook livré au
  back-office en ligne (signature acceptée).

## Reste à raccorder avant d'ouvrir les ventes

1. **SasPay** : fait (compte vérifié, clé `sk_live_…` « Encaissement », webhook et abonnements,
   Airtel Gabon et Moov Money Gabon ouverts, frais « Déduits », vérifiés par un paiement réel). La
   carte bancaire est indisponible chez SasPay : retirer « ou carte bancaire » des textes de la
   boutique.
2. **Variables de production** (hPanel du back-office) : faites le 6 novembre 2026.
3. **E-mails** : envoi SMTP depuis `boutique@crn-convention2026.events` (boîte Hostinger du
   domaine, active) dès que `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` sont renseignés dans hPanel ;
   essai : `npm --prefix backend run courriel:test -- adresse@exemple.com`. Sans eux, les e-mails
   sont écrits sur le serveur et rien n'est envoyé. Un échec d'envoi ne bloque jamais la
   confirmation (billets visibles sur la page de suivi, échec journalisé). **Limite** : l'offre
   actuelle (Starter Business Email, essai gratuit) plafonne à 100 e-mails envoyés par 24 h, soit
   un e-mail par commande plus un par titulaire offert ; à relever avant l'ouverture des ventes.
4. CGV publiées, capacités des séances (quota vide = ventes bloquées), stocks, liste des églises
   du réseau et frais de livraison, lieu de retrait, double authentification devant `/admin`.
5. Puis cocher « Ventes ouvertes » (Boutique · Réglages) et faire une vente réelle de contrôle.
