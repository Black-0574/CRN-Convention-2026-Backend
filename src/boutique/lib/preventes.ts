/**
 * Préventes (Commanditaire, 26 novembre 2026) : pass et tickets payés avant l'ouverture de la
 * boutique (ex. 40 Pass Convention Intégral à 120 000 F CFA, palier du 25 au 31 octobre).
 *
 * Un membre de l'équipe (administrateur ou COM Boutique, compte nominatif) enregistre chaque
 * acheteur : la commande est créée au prix réellement payé, qui doit être l'un des paliers du
 * produit, puis passée « payée » sans nouvel encaissement (moyen « Prévente »). Billets émis et
 * envoyés comme pour un achat en ligne ; places, quotas et articles du kit décomptés normalement ;
 * chaque enregistrement est inscrit au journal des actions et dans « Événements de paiement ».
 */
import { formaterXAF } from '../domaine/src/index.ts';
import type { Payload } from 'payload';

import type { Commande, Produit, Variante } from '../../payload-types';
import { estVisible, paliersDe } from './catalogue';
import { emettre } from './emission';
import { envoiBillets, enCaisse } from './especes';
import { lignes, sql } from './db';
import { creerCommande, ErreurVente, transition, type CanalBillets } from './ventes';

export const PRESTATAIRE_PREVENTE = 'prevente';
export const STATUT_EVENEMENT_PREVENTE = 'Prévente enregistrée (payée avant l’ouverture)';

const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Libreville' });

/** Produits nominatifs proposés en prévente, avec leurs tarifs et les choix du kit (tee-shirt). */
export async function optionsPreventes(payload: Payload) {
  const { docs } = await payload.find({
    collection: 'produits',
    where: { type: { in: ['pass', 'ticket'] }, reserveTests: { not_equals: true } },
    sort: 'ordre',
    depth: 1,
    limit: 200,
    pagination: false,
  });
  const produits = [];
  for (const p of (docs as Produit[]).filter(estVisible)) {
    const variante = (await payload.find({ collection: 'variantes', where: { produit: { equals: p.id }, actif: { equals: true } }, sort: 'ordre', limit: 1, depth: 0 })).docs[0];
    if (!variante) continue;
    const kit = [];
    for (const k of p.kit ?? []) {
      const kp = typeof k.produit === 'object' ? (k.produit as Produit) : null;
      if (!kp) continue;
      const choix = (await payload.find({ collection: 'variantes', where: { produit: { equals: kp.id }, actif: { equals: true } }, sort: 'ordre', limit: 1000, depth: 0, pagination: false })).docs.map((v) => (v as Variante).libelle);
      if (choix.length > 1) kit.push({ article: kp.nom, choix });
    }
    const paliers = p.paliers ?? [];
    produits.push({
      id: p.id,
      nom: p.nom,
      varianteId: variante.id,
      // Plusieurs tarifs : date de début de chacun (« à partir du 1er novembre »).
      tarifs: paliersDe(p).map((t, i) => {
        const du = paliers.length > 1 ? paliers[i]?.du?.slice(0, 10) : undefined;
        return { prixXAF: t.prixXAF, libelle: `${formaterXAF(t.prixXAF)}${du ? ` (à partir du ${jour.format(new Date(`${du}T12:00:00Z`)).replace(/^1 /, '1er ')})` : ''}` };
      }),
      kit,
    });
  }
  return { produits };
}

export interface SaisiePrevente {
  produitId: number;
  prixXAF: number;
  prenom: string;
  nom: string;
  telephone: string;
  email?: string;
  canalBillets?: CanalBillets;
  whatsapp?: string;
  /** Choix de l'article du kit (ex. « Gamme 1 — Noir — M »), si le kit en propose plusieurs. */
  choixKit?: string;
  /** Référence du paiement d'origine (reçu, liste de prévente), facultative. */
  reference?: string;
  /** Enregistrer même si une prévente au même nom et au même téléphone existe déjà. */
  confirmerDoublon?: boolean;
}

const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const chiffres = (v: string) => v.replace(/\D/g, '').slice(-8);

/** Prévente déjà enregistrée pour la même personne (nom et téléphone) : protège un import relancé. */
async function doublon(payload: Payload, s: SaisiePrevente): Promise<string | null> {
  const motif = `%${chiffres(s.telephone)}%`;
  const telephone = sql.raw(`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telephone, ''), ' ', ''), '.', ''), '-', ''), '+', ''), '(', ''), ')', '')`);
  const trouvees = await lignes<{ numero: string }>(
    payload,
    sql`SELECT numero FROM commandes WHERE paiement_prestataire = ${PRESTATAIRE_PREVENTE} AND statut = 'payee'
        AND LOWER(nom) = ${texte(s.nom).toLowerCase()} AND LOWER(prenom) = ${texte(s.prenom).toLowerCase()} AND ${telephone} LIKE ${motif} LIMIT 1`,
  );
  return trouvees[0]?.numero ?? null;
}

export async function enregistrerPrevente(payload: Payload, s: SaisiePrevente, agent: { id: number; nom: string }) {
  const produit = (await payload.findByID({ collection: 'produits', id: Number(s.produitId), depth: 0 }).catch(() => null)) as Produit | null;
  if (!produit || (produit.type !== 'pass' && produit.type !== 'ticket')) throw new ErreurVente('Choisissez un pass ou un ticket.');
  const prixXAF = Number(s.prixXAF);
  if (!Number.isInteger(prixXAF) || prixXAF <= 0) throw new ErreurVente('Indiquez le prix payé.');
  if (chiffres(texte(s.telephone)).length >= 6 && !s.confirmerDoublon) {
    const existante = await doublon(payload, s);
    if (existante) throw new ErreurVente(`Prévente déjà enregistrée pour ${texte(s.prenom)} ${texte(s.nom)} (commande ${existante}).`, 409);
  }
  const variante = (await payload.find({ collection: 'variantes', where: { produit: { equals: produit.id }, actif: { equals: true } }, sort: 'ordre', limit: 1, depth: 0 })).docs[0];
  if (!variante) throw new ErreurVente(`${produit.nom} : indisponible.`, 409);

  const personne = { prenom: texte(s.prenom), nom: texte(s.nom), telephone: texte(s.telephone), email: texte(s.email) };
  const canalBillets: CanalBillets = s.canalBillets ?? (personne.email ? 'email' : 'whatsapp');
  const aKit = (produit.kit ?? []).length > 0;
  const creee = await creerCommande(
    payload,
    {
      client: personne,
      canalBillets,
      ...(texte(s.whatsapp) ? { whatsapp: texte(s.whatsapp) } : {}),
      lignes: [{ varianteId: variante.id, quantite: 1 }],
      titulaires: [{ ligne: 0, ...personne, ...(texte(s.choixKit) ? { tailleTeeShirt: texte(s.choixKit) } : {}) }],
      // Articles du kit : remis sur le lieu de la Convention.
      ...(aKit ? { livraison: { mode: 'convention' } } : {}),
      cgvAcceptees: true,
      provenance: { source: 'prevente' },
    },
    new Date(),
    { prixPrevente: prixXAF },
  );

  const payeeA = new Date().toISOString();
  const reference = texte(s.reference);
  await payload.update({
    collection: 'commandes',
    id: creee.id,
    data: {
      paiement: {
        prestataire: PRESTATAIRE_PREVENTE,
        moyen: 'prevente',
        detail: `Prévente payée avant l’ouverture${reference ? ` — ${reference}` : ''}`,
        payeeA,
        encaissePar: agent.nom,
        encaisseParId: agent.id,
      },
    },
  });
  if (!(await transition(payload, creee.id, 'payee'))) throw new ErreurVente('Commande déjà traitée : actualisez.', 409);
  await payload.create({
    collection: 'journal-actions',
    data: { utilisateur: agent.id, action: 'enregistrement de prévente', collection: 'commandes', document: String(creee.id), details: { numero: creee.numero, montantXAF: creee.totalXAF, reference: reference || null } },
  });
  await emettre(payload, creee.id);

  const payee = (await payload.findByID({ collection: 'commandes', id: creee.id, depth: 0 })) as Commande;
  const envoi = await envoiBillets(payload, payee);
  try {
    await payload.create({
      collection: 'evenements-webhook',
      data: {
        cle: `${PRESTATAIRE_PREVENTE}:${payee.numero}`,
        referenceCommande: payee.numero,
        statut: STATUT_EVENEMENT_PREVENTE,
        montantXAF: payee.totalXAF,
        resultat: `${envoi.billets.length} billet(s) émis${payee.email ? `, envoyés par e-mail à ${payee.email}` : ''} · enregistré par ${agent.nom}`,
        brut: { moyen: 'prevente', reference: reference || null, enregistrePar: agent.nom, canalBillets, payeeA, billets: envoi.billets.map((b) => b.numero) },
      },
    });
  } catch {
    // Déjà enregistré (clé unique) : rien à faire.
  }
  return { commande: enCaisse(payee), ...envoi };
}
