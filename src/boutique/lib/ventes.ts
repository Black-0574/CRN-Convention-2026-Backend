/**
 * Tunnel de vente côté serveur (F01, F02, F03).
 *
 * Création de commande : contrôle des titulaires (un par exemplaire, âge déclaratif), prix du
 * palier en vigueur, kits à 0 F CFA, mode de livraison des articles (église du réseau, domicile à
 * Libreville, retrait à la Convention) et ses frais, puis réservation de chaque stock et quota par une instruction
 * SQL conditionnelle unique — aucune survente possible, même sous forte concurrence. Si une
 * réservation échoue, les précédentes sont libérées aussitôt (et la tâche d'expiration reste un
 * filet de sécurité).
 *
 * États : en_attente → payee | echouee | expiree ; chaque transition est une mise à jour
 * conditionnelle (« WHERE statut = 'en_attente' ») : une seule gagne si deux arrivent en même temps
 * (paiement confirmé et expiration, par exemple).
 */
import { finReservation, palierEnVigueur } from '../domaine/src/index.ts';
import { randomBytes } from 'node:crypto';
import type { Payload } from 'payload';

import type { Produit, Quota, Variante } from '../../payload-types';
import { DEMO, estVisible, paliersDe } from './catalogue';
import { lignes, maintenant, modifie, sql } from './db';
import { optionsLivraison, preparerLivraison, type SaisieLivraison } from './livraison';

export class ErreurVente extends Error {
  constructor(
    message: string,
    readonly code = 400,
  ) {
    super(message);
  }
}

export interface SaisieTitulaire {
  /** Index de la ligne de panier concernée. */
  ligne: number;
  prenom: string;
  nom: string;
  telephone: string;
  email: string;
  dateNaissance?: string;
  tailleTeeShirt?: string;
}

export interface EntreeCommande {
  client: { prenom: string; nom: string; email: string; telephone: string };
  lignes: { varianteId: number; quantite: number }[];
  titulaires: SaisieTitulaire[];
  /** Obligatoire dès que la commande contient un article physique (article ou kit d'un pass). */
  livraison?: SaisieLivraison;
  consentement?: boolean;
  cgvAcceptees: boolean;
  provenance?: { source?: string; emplacement?: string; campagne?: string };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEPHONE = /^\+?[0-9 ().-]{8,20}$/;
const OUVERTURE_CONVENTION = '2026-12-06';
const MAX_PAR_LIGNE = 20;

const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function verifierPersonne(p: { prenom?: unknown; nom?: unknown; email?: unknown; telephone?: unknown }, qui: string) {
  if (!texte(p.prenom) || !texte(p.nom)) throw new ErreurVente(`${qui} : prénom et nom obligatoires.`);
  if (!EMAIL.test(texte(p.email))) throw new ErreurVente(`${qui} : adresse e-mail invalide.`);
  if (!TELEPHONE.test(texte(p.telephone))) throw new ErreurVente(`${qui} : numéro de téléphone invalide.`);
}

/** Âge (déclaratif) au premier jour de la Convention. */
export function ageALaConvention(dateNaissance: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateNaissance);
  if (!m) return null;
  const [a, mo, j] = OUVERTURE_CONVENTION.split('-').map(Number) as [number, number, number];
  const age = a - Number(m[1]) - (mo < Number(m[2]) || (mo === Number(m[2]) && j < Number(m[3])) ? 1 : 0);
  return age;
}

function nouveauNumero(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const octets = randomBytes(7);
  return `CRN-${[...octets].map((o) => alphabet[o % alphabet.length]).join('')}`;
}

interface LignePreparee {
  produit: Produit;
  variante: Variante;
  libelle: string;
  quantite: number;
  prixUnitaireXAF: number;
  kitDe?: string;
}

/** Variante d'un article de kit : la taille choisie si l'article en a plusieurs. */
async function varianteDeKit(payload: Payload, produitKit: Produit, taille: string | undefined, qui: string): Promise<Variante> {
  const variantes = (
    await payload.find({ collection: 'variantes', where: { produit: { equals: produitKit.id }, actif: { equals: true } }, sort: 'ordre', depth: 0 })
  ).docs as Variante[];
  if (variantes.length === 0) throw new ErreurVente(`${produitKit.nom} (kit) : indisponible.`, 409);
  if (variantes.length === 1) return variantes[0]!;
  const choisie = variantes.find((v) => v.libelle === taille);
  if (!choisie) throw new ErreurVente(`${qui} : choisissez la taille du ${produitKit.nom.toLowerCase()} inclus.`);
  return choisie;
}

export async function creerCommande(payload: Payload, entree: EntreeCommande, maintenant = new Date()) {
  const reglages = await payload.findGlobal({ slug: 'reglages-boutique' });
  // Ventes fermées : seuls les produits réservés aux tests restent achetables (tests des équipes).
  const fermees = new ErreurVente('Les ventes sont momentanément fermées.', 503);
  if (!entree.cgvAcceptees) throw new ErreurVente('Veuillez accepter les conditions générales de vente.');
  verifierPersonne(entree.client, 'Acheteur');
  if (!Array.isArray(entree.lignes) || entree.lignes.length === 0) throw new ErreurVente('Votre panier est vide.');

  const preparees: LignePreparee[] = [];
  const titulairesSaisis: SaisieTitulaire[] = [];

  for (const [index, l] of entree.lignes.entries()) {
    const quantite = Number(l.quantite);
    if (!Number.isInteger(quantite) || quantite < 1 || quantite > MAX_PAR_LIGNE) throw new ErreurVente('Quantité invalide.');
    const variante = (await payload.findByID({ collection: 'variantes', id: l.varianteId, depth: 2 }).catch(() => null)) as Variante | null;
    const produit = variante && typeof variante.produit === 'object' ? (variante.produit as Produit) : null;
    if (!variante || !produit || !variante.actif || !estVisible(produit)) throw new ErreurVente('Un article de votre panier n’est plus disponible.', 409);
    if (!reglages.ventesOuvertes && !produit.reserveTests) throw fermees;
    const palier = palierEnVigueur(paliersDe(produit), maintenant);
    if (!palier) throw new ErreurVente(`${produit.nom} : pas en vente à cette date.`, 409);

    preparees.push({
      produit,
      variante,
      libelle: variante.libelle === 'Unique' ? produit.nom : `${produit.nom} — ${variante.libelle}`,
      quantite,
      prixUnitaireXAF: palier.prixXAF,
    });

    if (produit.type === 'pass' || produit.type === 'ticket') {
      // F02 : un titulaire nominatif par exemplaire.
      const saisis = (entree.titulaires ?? []).filter((t) => t.ligne === index);
      if (saisis.length !== quantite) throw new ErreurVente(`${produit.nom} : un titulaire par billet est requis (${quantite}).`);
      for (const [n, t] of saisis.entries()) {
        const qui = `${produit.nom}, titulaire ${n + 1}`;
        verifierPersonne(t, qui);
        if (produit.ageMin || produit.ageMax) {
          const age = t.dateNaissance ? ageALaConvention(t.dateNaissance) : null;
          if (age === null) throw new ErreurVente(`${qui} : date de naissance requise.`);
          if ((produit.ageMin && age < produit.ageMin) || (produit.ageMax && age > produit.ageMax)) {
            throw new ErreurVente(`${qui} : ce pass est réservé aux ${produit.ageMin}–${produit.ageMax} ans.`);
          }
        }
        titulairesSaisis.push({
          ligne: index,
          prenom: texte(t.prenom),
          nom: texte(t.nom),
          telephone: texte(t.telephone),
          email: texte(t.email).toLowerCase(),
          ...(t.dateNaissance ? { dateNaissance: t.dateNaissance } : {}),
          ...(t.tailleTeeShirt ? { tailleTeeShirt: t.tailleTeeShirt } : {}),
        });
        // Kit inclus : lignes à 0 F CFA, à retirer, avec la taille choisie par le titulaire.
        for (const k of produit.kit ?? []) {
          const kp = (typeof k.produit === 'object' ? k.produit : await payload.findByID({ collection: 'produits', id: k.produit, depth: 0 })) as Produit;
          const kv = await varianteDeKit(payload, kp, t.tailleTeeShirt, qui);
          preparees.push({
            produit: kp,
            variante: kv,
            libelle: `${kp.nom}${kv.libelle === 'Unique' ? '' : ` — ${kv.libelle}`} (inclus, ${texte(t.prenom)} ${texte(t.nom)})`,
            quantite: k.quantite,
            prixUnitaireXAF: 0,
            kitDe: produit.nom,
          });
        }
      }
    }
  }

  // Articles physiques (articles officiels, kits des pass) : un mode de livraison et ses frais.
  const aLivrer = preparees.some((l) => l.kitDe || l.produit.type === 'physique');
  let livraison: Exclude<ReturnType<typeof preparerLivraison>, { erreur: string }> | null = null;
  if (aLivrer) {
    const resultat = preparerLivraison(await optionsLivraison(payload), entree.livraison);
    if ('erreur' in resultat) throw new ErreurVente(resultat.erreur);
    livraison = resultat;
  }

  const totalXAF = preparees.reduce((s, l) => s + l.quantite * l.prixUnitaireXAF, 0) + (livraison?.fraisXAF ?? 0);
  const expireA = finReservation(maintenant);
  const commande = await payload.create({
    collection: 'commandes',
    data: {
      numero: nouveauNumero(),
      statut: 'en_attente',
      prenom: texte(entree.client.prenom),
      nom: texte(entree.client.nom),
      email: texte(entree.client.email).toLowerCase(),
      telephone: texte(entree.client.telephone),
      lignes: preparees.map((l) => ({
        produit: l.produit.id,
        variante: l.variante.id,
        libelle: l.libelle,
        quantite: l.quantite,
        prixUnitaireXAF: l.prixUnitaireXAF,
        ...(l.kitDe ? { kitDe: l.kitDe } : {}),
      })),
      ...(livraison ? { livraison } : {}),
      totalXAF,
      reservationExpireA: expireA.toISOString(),
      provenance: entree.provenance ?? {},
      cgvVersion: reglages.legal?.cgvVersion || (DEMO ? 'démonstration' : ''),
      jetonSuivi: randomBytes(18).toString('base64url'),
      titulairesSaisis,
    },
  });

  // F03 : réservations atomiques (variantes, puis quotas des billets).
  const besoinsQuotas = new Map<number, number>();
  for (const l of preparees) {
    for (const q of l.produit.quotas ?? []) {
      const id = typeof q === 'object' ? (q as Quota).id : q;
      besoinsQuotas.set(id, (besoinsQuotas.get(id) ?? 0) + l.quantite);
    }
  }
  const besoinsVariantes = new Map<number, { quantite: number; libelle: string }>();
  for (const l of preparees) {
    const b = besoinsVariantes.get(l.variante.id);
    besoinsVariantes.set(l.variante.id, { quantite: (b?.quantite ?? 0) + l.quantite, libelle: l.libelle });
  }

  try {
    for (const [id, { quantite, libelle }] of besoinsVariantes) {
      const ok = await modifie(
        payload,
        sql`UPDATE variantes SET stock_reserve = COALESCE(stock_reserve, 0) + ${quantite}
            WHERE id = ${id} AND (stock IS NULL OR stock - COALESCE(stock_vendu, 0) - COALESCE(stock_reserve, 0) >= ${quantite})
            RETURNING id`,
      );
      if (!ok) throw new ErreurVente(`${libelle} : stock insuffisant.`, 409);
      await payload.create({ collection: 'reservations', data: { commande: commande.id, cible: 'variante', cibleId: id, quantite, expireA: expireA.toISOString() } });
    }
    for (const [id, quantite] of besoinsQuotas) {
      const ok = await modifie(
        payload,
        sql`UPDATE quotas SET reserves = COALESCE(reserves, 0) + ${quantite}
            WHERE id = ${id} AND capacite IS NOT NULL AND capacite - COALESCE(vendus, 0) - COALESCE(reserves, 0) >= ${quantite}
            RETURNING id`,
      );
      if (!ok) throw new ErreurVente('Plus assez de places disponibles pour l’un des billets de votre panier.', 409);
      await payload.create({ collection: 'reservations', data: { commande: commande.id, cible: 'quota', cibleId: id, quantite, expireA: expireA.toISOString() } });
    }
  } catch (erreur) {
    await liberer(payload, commande.id);
    await modifie(payload, sql`UPDATE commandes SET statut = 'echouee' WHERE id = ${commande.id} AND statut = 'en_attente' RETURNING id`);
    throw erreur;
  }

  // Consentement facultatif, distinct de l'achat, horodaté et versionné.
  if (entree.consentement === true) {
    await payload.create({
      collection: 'consentements',
      data: {
        commande: commande.id,
        email: commande.email,
        telephone: commande.telephone,
        finalite: 'etre_recontacte_par_le_crn',
        accepte: true,
        version: reglages.consentement?.version ?? '',
        texte: reglages.consentement?.texte ?? '',
      },
    });
  }

  return commande;
}

/** Libère les réservations actives d'une commande (échec, expiration). */
export async function liberer(payload: Payload, commandeId: number): Promise<void> {
  const actives = await lignes<{ id: number; cible: string; cible_id: string; quantite: string }>(
    payload,
    sql`SELECT id, cible, cible_id, quantite FROM reservations WHERE commande_id = ${commandeId} AND statut = 'active'`,
  );
  for (const r of actives) {
    // La réservation ne change d'état qu'une fois : pas de double libération.
    if (!(await modifie(payload, sql`UPDATE reservations SET statut = 'liberee' WHERE id = ${r.id} AND statut = 'active' RETURNING id`))) continue;
    if (r.cible === 'variante') {
      await lignes(payload, sql`UPDATE variantes SET stock_reserve = MAX(COALESCE(stock_reserve, 0) - ${Number(r.quantite)}, 0) WHERE id = ${Number(r.cible_id)}`);
    } else {
      await lignes(payload, sql`UPDATE quotas SET reserves = MAX(COALESCE(reserves, 0) - ${Number(r.quantite)}, 0) WHERE id = ${Number(r.cible_id)}`);
    }
  }
}

/** Paiement confirmé : réservé → vendu. */
export async function convertir(payload: Payload, commandeId: number): Promise<void> {
  const actives = await lignes<{ id: number; cible: string; cible_id: string; quantite: string }>(
    payload,
    sql`SELECT id, cible, cible_id, quantite FROM reservations WHERE commande_id = ${commandeId} AND statut = 'active'`,
  );
  for (const r of actives) {
    if (!(await modifie(payload, sql`UPDATE reservations SET statut = 'convertie' WHERE id = ${r.id} AND statut = 'active' RETURNING id`))) continue;
    const n = Number(r.quantite);
    if (r.cible === 'variante') {
      await lignes(payload, sql`UPDATE variantes SET stock_reserve = MAX(COALESCE(stock_reserve, 0) - ${n}, 0), stock_vendu = COALESCE(stock_vendu, 0) + ${n} WHERE id = ${Number(r.cible_id)}`);
    } else {
      await lignes(payload, sql`UPDATE quotas SET reserves = MAX(COALESCE(reserves, 0) - ${n}, 0), vendus = COALESCE(vendus, 0) + ${n} WHERE id = ${Number(r.cible_id)}`);
    }
  }
}

/** Fait passer une commande en attente à un nouvel état ; `false` si elle n'était plus en attente. */
export async function transition(payload: Payload, commandeId: number, statut: 'payee' | 'echouee' | 'expiree'): Promise<boolean> {
  return modifie(payload, sql`UPDATE commandes SET statut = ${statut}, updated_at = ${maintenant()} WHERE id = ${commandeId} AND statut = 'en_attente' RETURNING id`);
}

/** Expire les commandes dont la réservation est échue et libère leurs places. */
export async function expirerReservations(payload: Payload, maintenant = new Date()): Promise<number> {
  const echues = await lignes<{ id: number }>(
    payload,
    sql`SELECT id FROM commandes WHERE statut = 'en_attente' AND reservation_expire_a < ${maintenant.toISOString()}`,
  );
  let n = 0;
  for (const { id } of echues) {
    if (await transition(payload, id, 'expiree')) {
      await liberer(payload, id);
      n++;
    }
  }
  return n;
}
