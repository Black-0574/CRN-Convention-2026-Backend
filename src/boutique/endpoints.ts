/**
 * API de la boutique (préfixe /api). Public : catalogue, « mis en avant » (site de la Convention),
 * commande, paiement, suivi, téléchargement de billet signé. Réservé : scan (COM Boutique),
 * tableau de bord, exports (comptabilité), réconciliation (administrateur). En développement
 * seulement : simulation de l'agrégateur de paiement (Mobile Money multi-pays et carte) et lecture
 * des e-mails capturés.
 */
import { traiterWebhook, type BacASable, type MoyenPaiement } from './domaine/src/index.ts';
import type { Endpoint, PayloadRequest } from 'payload';

import { roleDe, type Role } from './lib/acces';
import { lienBillet, lienValide, lireBillet } from './lib/billets';
import { catalogue, DEMO, estVisible, vueProduit } from './lib/catalogue';
import { optionsLivraison, texteLivraison } from './lib/livraison';
import { courrielsDe, lireCourriel } from './lib/messagerie';
import { bacASableActif, depot, prestataire } from './lib/paiement';
import { scanner } from './lib/scan';
import { csv, tableau } from './lib/tableau';
import { reconcilier } from './lib/taches';
import { urlBackOffice, urlSuivi } from './lib/urls';
import { creerCommande, ErreurVente, type EntreeCommande } from './lib/ventes';

const DEV = process.env.NODE_ENV !== 'production';

const json = (donnees: unknown, status = 200) => Response.json(donnees, { status, headers: { 'Cache-Control': 'no-store' } });
const erreur = (message: string, status = 400) => json({ erreur: message }, status);

const param = (req: PayloadRequest, nom: string) => String((req.routeParams as Record<string, unknown> | undefined)?.[nom] ?? '');
const query = (req: PayloadRequest, nom: string) => req.searchParams?.get(nom) ?? null;

async function corpsJson<T>(req: PayloadRequest): Promise<T | null> {
  try {
    return ((await req.json?.()) ?? null) as T | null;
  } catch {
    return null;
  }
}

const autorise = (req: PayloadRequest, ...roles: Role[]) => {
  const r = roleDe(req);
  return r === 'admin' || (r !== undefined && roles.includes(r));
};

async function commandeSuivie(req: PayloadRequest) {
  const { docs } = await req.payload.find({ collection: 'commandes', where: { numero: { equals: param(req, 'numero') } }, limit: 1, depth: 1 });
  const c = docs[0];
  return c && c.jetonSuivi === query(req, 't') ? c : null;
}

/** Commande d'après la référence de paiement externe (page de paiement simulée, local uniquement). */
async function commandeParReference(req: PayloadRequest, referenceExterne: string) {
  if (!referenceExterne) return null;
  const { docs } = await req.payload.find({ collection: 'commandes', where: { 'paiement.referenceExterne': { equals: referenceExterne } }, limit: 1, depth: 0 });
  return docs[0] ?? null;
}

export const endpoints: Endpoint[] = [
  // ——— Site de la Convention (LOT A, A2) ———
  {
    path: '/mis-en-avant',
    method: 'get',
    handler: async (req) => {
      const vues = (await catalogue(req.payload)).filter((v) => v.misEnAvant && v.prixXAF !== null);
      vues.sort((a, b) => a.ordreMiseEnAvant - b.ordreMiseEnAvant);
      return Response.json(
        vues.slice(0, 8).map((v) => ({
          slug: v.slug,
          nom: v.nom,
          image: v.photos[0]?.carte ?? null,
          prixXAF: v.prixXAF,
          badge: v.badge,
          ordre: v.ordreMiseEnAvant,
          ...(v.paliers.length > 1 ? { paliers: v.paliers } : {}),
        })),
        { headers: { 'Cache-Control': 'public, max-age=60' } },
      );
    },
  },

  // ——— Vitrine ———
  {
    path: '/boutique/catalogue',
    method: 'get',
    handler: async (req) => json({ demo: DEMO, produits: await catalogue(req.payload) }),
  },
  {
    path: '/boutique/produits/:slug',
    method: 'get',
    handler: async (req) => {
      const { docs } = await req.payload.find({ collection: 'produits', where: { slug: { equals: param(req, 'slug') } }, limit: 1, depth: 1 });
      const p = docs[0];
      if (!p || !estVisible(p)) return erreur('Produit introuvable.', 404);
      return json({ demo: DEMO, produit: await vueProduit(req.payload, p) });
    },
  },
  {
    path: '/boutique/reglages',
    method: 'get',
    handler: async (req) => {
      const r = await req.payload.findGlobal({ slug: 'reglages-boutique' });
      return json({
        ventesOuvertes: r.ventesOuvertes,
        consentement: r.consentement,
        legal: { cgvVersion: r.legal?.cgvVersion || null, cgv: r.legal?.cgv || null },
        demo: DEMO,
      });
    },
  },

  // Modes de livraison des articles proposés au client (lus en direct au moment de la commande).
  {
    path: '/boutique/livraison',
    method: 'get',
    handler: async (req) => json(await optionsLivraison(req.payload)),
  },

  // ——— Commande et paiement ———
  {
    path: '/boutique/commandes',
    method: 'post',
    handler: async (req) => {
      const entree = await corpsJson<EntreeCommande>(req);
      if (!entree) return erreur('Requête invalide.');
      try {
        const c = await creerCommande(req.payload, entree);
        return json({ numero: c.numero, jetonSuivi: c.jetonSuivi, totalXAF: c.totalXAF, reservationExpireA: c.reservationExpireA }, 201);
      } catch (e) {
        if (e instanceof ErreurVente) return erreur(e.message, e.code);
        req.payload.logger.error(e);
        return erreur('Erreur inattendue, veuillez réessayer.', 500);
      }
    },
  },
  {
    path: '/boutique/commandes/:numero',
    method: 'get',
    handler: async (req) => {
      const c = await commandeSuivie(req);
      if (!c) return erreur('Commande introuvable.', 404);
      const titulaires = c.statut === 'payee' ? (await req.payload.find({ collection: 'titulaires', where: { commande: { equals: c.id } }, limit: 200, depth: 0, sort: 'numeroBillet' })).docs : [];
      const reglages = await req.payload.findGlobal({ slug: 'reglages-boutique' });
      return json({
        numero: c.numero,
        statut: c.statut,
        totalXAF: c.totalXAF,
        reservationExpireA: c.reservationExpireA,
        prenom: c.prenom,
        lignes: (c.lignes ?? []).map((l) => ({
          libelle: l.libelle,
          quantite: l.quantite,
          prixUnitaireXAF: l.prixUnitaireXAF,
          inclus: Boolean(l.kitDe),
          aLivrer: Boolean(l.kitDe) || (typeof l.produit === 'object' && l.produit.type === 'physique'),
        })),
        paiement: { moyen: c.paiement?.moyen ?? null, detail: c.paiement?.detail ?? null, enCours: Boolean(c.paiement?.referenceExterne) },
        billets: titulaires.map((t) => ({ numero: t.numeroBillet, titulaire: `${t.prenom} ${t.nom}`, lien: lienBillet(urlBackOffice(), t.numeroBillet) })),
        livraison: c.livraison?.mode
          ? { mode: c.livraison.mode, destination: c.livraison.destination ?? null, fraisXAF: c.livraison.fraisXAF ?? 0, texte: texteLivraison(c.livraison, reglages.livraison?.horairesRetrait) }
          : null,
        ...(DEV ? { courrielsLocaux: await courrielsDe(c.numero) } : {}),
      });
    },
  },
  {
    path: '/boutique/commandes/:numero/paiement',
    method: 'post',
    handler: async (req) => {
      const c = await commandeSuivie(req);
      if (!c) return erreur('Commande introuvable.', 404);
      if (c.statut !== 'en_attente') return erreur('Cette commande n’est plus en attente de paiement.', 409);
      if (c.reservationExpireA && new Date(c.reservationExpireA) < new Date()) return erreur('Le délai de réservation est dépassé : recommencez votre commande.', 409);
      // Le client choisit son moyen (Mobile Money de son pays ou carte bancaire) sur la page
      // sécurisée de l'agrégateur, qui le renvoie ensuite vers le suivi de sa commande.
      const p = prestataire();
      const { referenceExterne, redirection } = await p.creerPaiement({
        referenceCommande: c.numero,
        montantXAF: c.totalXAF,
        telephone: c.telephone,
        email: c.email,
        nom: `${c.prenom} ${c.nom}`,
        description: `Commande ${c.numero} — Boutique de la Convention CRN 2026`,
        urlRetour: urlSuivi(c.numero, c.jetonSuivi),
      });
      if (!redirection) return erreur('Le prestataire de paiement n’a pas répondu : réessayez dans un instant.', 502);
      await req.payload.update({ collection: 'commandes', id: c.id, data: { paiement: { prestataire: p.nom, referenceExterne } } });
      return json({ referenceExterne, redirection, simulation: p.nom === 'bac-a-sable' });
    },
  },
  {
    path: '/boutique/paiements/:prestataire/webhook',
    method: 'post',
    handler: async (req) => {
      const nom = param(req, 'prestataire');
      let p;
      try {
        p = prestataire(nom);
      } catch {
        return erreur('Prestataire inconnu.', 404);
      }
      const corps = (await req.text?.()) ?? '';
      const entetes = Object.fromEntries(req.headers.entries());
      const r = await traiterWebhook(p, depot(req.payload, nom), corps, entetes);
      return json({ resultat: r.resultat }, r.code);
    },
  },

  // ——— Billets ———
  {
    path: '/boutique/billets/:numero',
    method: 'get',
    handler: async (req) => {
      const numero = param(req, 'numero');
      if (!lienValide(numero, query(req, 'exp'), query(req, 'sig'))) return erreur('Lien de billet invalide ou expiré.', 403);
      const { docs } = await req.payload.find({ collection: 'titulaires', where: { numeroBillet: { equals: numero } }, limit: 1, depth: 0 });
      const t = docs[0];
      if (!t?.fichierBillet) return erreur('Billet introuvable.', 404);
      const pdf = await lireBillet(t.fichierBillet);
      return new Response(new Uint8Array(pdf), {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="billet-${numero}.pdf"`, 'Cache-Control': 'private, no-store' },
      });
    },
  },

  // ——— Contrôle d'accès (COM Boutique) ———
  {
    path: '/boutique/scan/plateformes',
    method: 'get',
    handler: async (req) => {
      if (!autorise(req, 'com_boutique')) return erreur('Accès réservé à la COM Boutique.', 401);
      const { docs } = await req.payload.find({ collection: 'plateformes', limit: 500, depth: 0, sort: 'debut', pagination: false });
      return json(docs.map((p) => ({ code: p.code, nom: p.nom, lieu: p.lieu ?? null, debut: p.debut ?? null })));
    },
  },
  {
    path: '/boutique/scan',
    method: 'post',
    handler: async (req) => {
      if (!autorise(req, 'com_boutique')) return erreur('Accès réservé à la COM Boutique.', 401);
      const corps = await corpsJson<{ jeton?: string; plateforme?: string; poste?: string }>(req);
      if (!corps?.jeton || !corps.plateforme || !corps.poste) return erreur('Jeton, plateforme et poste requis.');
      try {
        return json(await scanner(req.payload, { jeton: corps.jeton, plateformeCode: corps.plateforme, poste: corps.poste, agentId: Number(req.user!.id) }));
      } catch (e) {
        return erreur((e as Error).message);
      }
    },
  },

  // ——— Pilotage ———
  {
    path: '/boutique/tableau',
    method: 'get',
    handler: async (req) => (autorise(req, 'comptabilite', 'com_boutique', 'catalogue') ? json(await tableau(req.payload)) : erreur('Non autorisé.', 401)),
  },
  {
    path: '/boutique/exports/:type',
    method: 'get',
    handler: async (req) => {
      if (!autorise(req, 'comptabilite')) return erreur('Accès réservé à la comptabilité.', 401);
      const type = param(req, 'type');
      let contenu: string;
      if (type === 'ventes.csv') {
        const { docs } = await req.payload.find({ collection: 'commandes', where: { statut: { equals: 'payee' } }, limit: 10000, depth: 0, pagination: false });
        contenu = csv(
          ['Commande', 'Payée le', 'Acheteur', 'E-mail', 'Téléphone', 'Article', 'Quantité', 'Prix unitaire (F CFA)', 'Montant (F CFA)', 'Source', 'Emplacement'],
          docs.flatMap((c) =>
            (c.lignes ?? []).map((l) => [c.numero, c.paiement?.payeeA ?? '', `${c.prenom} ${c.nom}`, c.email, c.telephone, l.libelle, l.quantite, l.prixUnitaireXAF, l.quantite * l.prixUnitaireXAF, c.provenance?.source ?? '', c.provenance?.emplacement ?? '']),
          ),
        );
      } else if (type === 'titulaires.csv') {
        const { docs } = await req.payload.find({ collection: 'titulaires', limit: 10000, depth: 1, pagination: false, sort: 'numeroBillet' });
        contenu = csv(
          ['Billet', 'Prénom', 'Nom', 'Téléphone', 'E-mail', 'Produit', 'Taille tee-shirt', 'Émis le'],
          docs.map((t) => [t.numeroBillet, t.prenom, t.nom, t.telephone, t.email, typeof t.produit === 'object' ? t.produit.nom : '', t.tailleTeeShirt ?? '', t.emisA ?? '']),
        );
      } else if (type === 'consentements.csv') {
        const { docs } = await req.payload.find({ collection: 'consentements', limit: 10000, depth: 0, pagination: false });
        contenu = csv(['E-mail', 'Téléphone', 'Finalité', 'Accepté', 'Version', 'Horodatage'], docs.map((c) => [c.email, c.telephone ?? '', c.finalite, c.accepte ? 'oui' : 'non', c.version, c.createdAt]));
      } else return erreur('Export inconnu.', 404);
      return new Response(contenu, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${type}"` } });
    },
  },
  {
    path: '/boutique/reconciliation',
    method: 'post',
    handler: async (req) => (autorise(req) ? json(await reconcilier(req.payload)) : erreur('Réservé à l’administrateur.', 401)),
  },

  // ——— Développement local uniquement ———
  {
    path: '/boutique/bac-a-sable/paiement',
    method: 'get',
    handler: async (req) => {
      if (!DEV) return erreur('Indisponible.', 404);
      const c = await commandeParReference(req, query(req, 'ref') ?? '');
      if (!c) return erreur('Paiement inconnu.', 404);
      return json({ numero: c.numero, montantXAF: c.totalXAF, statut: c.statut, email: c.email });
    },
  },
  {
    path: '/boutique/bac-a-sable/paiement',
    method: 'post',
    handler: async (req) => {
      if (!DEV) return erreur('Indisponible.', 404);
      const corps = await corpsJson<{ ref?: string; issue?: string; moyen?: string; detail?: string }>(req);
      const c = await commandeParReference(req, corps?.ref ?? '');
      if (!c?.paiement?.referenceExterne) return erreur('Paiement inconnu.', 404);
      if (corps?.issue !== 'valider' && corps?.issue !== 'refuser') return erreur('Issue inconnue.');
      const moyen: MoyenPaiement | undefined = corps.moyen === 'carte' || corps.moyen === 'mobile_money' ? corps.moyen : undefined;
      // Simule le webhook signé de l'agrégateur, traité exactement comme un vrai.
      const bas: BacASable = bacASableActif();
      const { corps: brut, entetes } = bas.webhook({
        idEvenement: `${c.paiement.referenceExterne}:${corps.issue}`,
        referenceCommande: c.numero,
        referenceExterne: c.paiement.referenceExterne,
        statut: corps.issue === 'valider' ? 'payee' : 'echouee',
        montantXAF: c.totalXAF,
        ...(moyen ? { moyen } : {}),
        ...(corps.detail ? { detail: String(corps.detail).slice(0, 120) } : {}),
      });
      const r = await traiterWebhook(bas, depot(req.payload, bas.nom), brut, entetes);
      return json({ resultat: r.resultat });
    },
  },
  {
    path: '/boutique/dev/courriels/:fichier',
    method: 'get',
    handler: async (req) => {
      if (!DEV) return erreur('Indisponible.', 404);
      try {
        return new Response(await lireCourriel(param(req, 'fichier')), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      } catch {
        return erreur('E-mail introuvable.', 404);
      }
    },
  },
];
