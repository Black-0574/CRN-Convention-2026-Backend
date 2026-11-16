/**
 * Paiement en espèces à la COM Boutique (Commanditaire, 16 novembre 2026).
 *
 * 1. Le client remplit sa commande (seul, ou aidé par une hôtesse ou un employé de la boutique) et
 *    choisit « Espèces » à l'étape du paiement : places, articles et prix restent réservés pendant
 *    le délai des réglages (5 jours par défaut), au lieu des 15 minutes du paiement en ligne.
 * 2. Il paie à la caisse de la COM Boutique ; le caissier (compte COM Boutique, nominatif) retrouve
 *    la commande sur la page « Caisse » et valide l'encaissement du montant exact.
 * 3. La commande passe « payée » : billets émis, envoyés par e-mail et/ou par WhatsApp selon le
 *    choix du client (WhatsApp : un toucher du caissier, message déjà rédigé).
 * Chaque encaissement est enregistré au nom du caissier (commande et journal des actions).
 */
import { formaterXAF, jourLibreville, lienWhatsApp, messageBillets, minuitLibreville, numeroWhatsApp } from '../domaine/src/index.ts';
import type { Payload } from 'payload';

import type { Commande } from '../../payload-types';
import { lienBillet } from './billets';
import { emettre } from './emission';
import { lignes, sql } from './db';
import { echapper, gabarit, messagerie } from './messagerie';
import { urlBackOffice, urlSuivi } from './urls';
import { ErreurVente, expirerReservations, transition } from './ventes';

export const PRESTATAIRE_ESPECES = 'especes';

const jourHeure = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' });

/** Réglages de la caisse, avec les valeurs « À annoncer » quand rien n'est saisi. */
export async function reglagesEspeces(payload: Payload) {
  const r = (await payload.findGlobal({ slug: 'reglages-boutique' })).especes;
  return {
    actif: r?.actif !== false,
    lieu: r?.lieu?.trim() || 'COM Boutique — Église Centrale, Libreville',
    horaires: r?.horaires?.trim() || null,
    delaiJours: r?.delaiJours && r.delaiJours > 0 ? r.delaiJours : 5,
  };
}

export const estEnEspeces = (c: Pick<Commande, 'paiement'>) => c.paiement?.prestataire === PRESTATAIRE_ESPECES;

async function commandeParNumero(payload: Payload, numero: string): Promise<Commande | null> {
  const { docs } = await payload.find({ collection: 'commandes', where: { numero: { equals: numero } }, limit: 1, depth: 0 });
  return (docs[0] as Commande | undefined) ?? null;
}

/** Le client choisit les espèces : réservation prolongée jusqu'à l'échéance de paiement. */
export async function choisirEspeces(payload: Payload, c: Commande, maintenant = new Date()): Promise<Commande> {
  const reglages = await reglagesEspeces(payload);
  if (!reglages.actif) throw new ErreurVente('Le paiement en espèces n’est pas proposé pour le moment.', 409);
  if (estEnEspeces(c) && c.statut === 'en_attente') return c;
  if (c.statut !== 'en_attente') throw new ErreurVente('Cette commande n’est plus en attente de paiement.', 409);
  if (c.reservationExpireA && new Date(c.reservationExpireA) < maintenant) throw new ErreurVente('Le délai de réservation est dépassé : recommencez votre commande.', 409);
  if (c.paiement?.referenceExterne) throw new ErreurVente('Un paiement en ligne a déjà été ouvert pour cette commande : terminez-le, ou recommencez votre commande.', 409);

  const echeance = new Date(maintenant.getTime() + reglages.delaiJours * 24 * 3600 * 1000).toISOString();
  await lignes(payload, sql`UPDATE reservations SET expire_a = ${echeance} WHERE commande_id = ${c.id} AND statut = 'active'`);
  const maj = (await payload.update({
    collection: 'commandes',
    id: c.id,
    data: { reservationExpireA: echeance, paiement: { prestataire: PRESTATAIRE_ESPECES, moyen: 'especes' } },
  })) as Commande;

  if (maj.email) {
    await messagerie
      .envoyer({
        a: maj.email,
        reference: maj.numero,
        sujet: `Commande ${maj.numero} à régler en espèces — Convention CRN 2026`,
        html: gabarit(
          `Commande ${maj.numero}`,
          `<p>Bonjour ${echapper(maj.prenom)},</p>
<p>Votre commande est réservée. Réglez <strong>${formaterXAF(maj.totalXAF)}</strong> en espèces à la caisse de la <strong>${echapper(reglages.lieu)}</strong>${reglages.horaires ? ` (${echapper(reglages.horaires)})` : ''}, avant le <strong>${jourHeure.format(new Date(echeance))}</strong>, en donnant le numéro de commande <strong>${maj.numero}</strong>.</p>
<p>Vos billets vous sont envoyés dès l’encaissement. Passé ce délai, la commande est annulée et les places sont rendues à la vente.</p>
<p><a href="${urlSuivi(maj.numero, maj.jetonSuivi)}" style="color:#1A2C5B;font-weight:700">Suivre ma commande</a></p>`,
        ),
      })
      .catch((e) => payload.logger.error(`E-mail « espèces » ${maj.numero} non envoyé : ${(e as Error).message}`));
  }
  return maj;
}

/** Billets d'une commande payée et message WhatsApp prêt à envoyer. */
export async function envoiBillets(payload: Payload, c: Commande) {
  const titulaires = (await payload.find({ collection: 'titulaires', where: { commande: { equals: c.id } }, limit: 200, depth: 1, sort: 'numeroBillet' })).docs;
  const billets = titulaires.map((t) => ({
    numero: t.numeroBillet,
    titulaire: `${t.prenom} ${t.nom}`,
    produit: typeof t.produit === 'object' ? t.produit.nom : '',
    lien: lienBillet(urlBackOffice(), t.numeroBillet),
  }));
  const message = messageBillets({ prenom: c.prenom, numero: c.numero, totalXAF: c.totalXAF, billets, suivi: urlSuivi(c.numero, c.jetonSuivi) });
  const numero = numeroWhatsApp(c.whatsapp || c.telephone);
  return { billets, message, whatsapp: { numero, lien: lienWhatsApp(numero, message) } };
}

export type CommandeEnCaisse = ReturnType<typeof enCaisse>;

/** Vue d'une commande pour la caisse (aucune donnée de paiement en ligne). */
export function enCaisse(c: Commande, maintenant = new Date()) {
  return {
    numero: c.numero,
    statut: c.statut,
    expiree: c.statut === 'en_attente' && Boolean(c.reservationExpireA && new Date(c.reservationExpireA) < maintenant),
    client: `${c.prenom} ${c.nom}`,
    telephone: c.telephone,
    email: c.email || null,
    canalBillets: c.canalBillets ?? 'email',
    totalXAF: c.totalXAF,
    echeance: c.reservationExpireA ?? null,
    payeeA: c.paiement?.payeeA ?? null,
    lignes: (c.lignes ?? []).map((l) => ({ libelle: l.libelle, quantite: l.quantite, montantXAF: l.quantite * l.prixUnitaireXAF, inclus: Boolean(l.kitDe) })),
    creeeA: c.createdAt,
  };
}

/** Commandes en espèces dont le téléphone ou le numéro WhatsApp contient ces chiffres (espaces, points, tirets ignorés). */
async function parTelephone(payload: Payload, chiffres: string): Promise<number[]> {
  const motif = `%${chiffres}%`;
  const chiffresDe = (colonne: 'telephone' | 'whatsapp') =>
    sql.raw(`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${colonne}, ''), ' ', ''), '.', ''), '-', ''), '+', ''), '(', ''), ')', '')`);
  const ids = await lignes<{ id: number }>(
    payload,
    sql`SELECT id FROM commandes WHERE paiement_prestataire = ${PRESTATAIRE_ESPECES} AND (${chiffresDe('telephone')} LIKE ${motif} OR ${chiffresDe('whatsapp')} LIKE ${motif}) LIMIT 50`,
  );
  return ids.length ? ids.map((r) => Number(r.id)) : [0];
}

/**
 * Recherche à la caisse : numéro de commande, téléphone, nom ou prénom. Sans recherche : les
 * commandes en espèces en attente, les plus récentes d'abord.
 */
export async function chercherEnCaisse(payload: Payload, q: string) {
  const terme = q.trim();
  const chiffres = terme.replace(/\D/g, '');
  const enEspeces = { 'paiement.prestataire': { equals: PRESTATAIRE_ESPECES } };
  const where = !terme
    ? { and: [enEspeces, { statut: { equals: 'en_attente' } }] }
    : {
        and: [
          enEspeces,
          {
            or: [
              { numero: { like: terme.toUpperCase() } },
              { nom: { like: terme } },
              { prenom: { like: terme } },
              ...(chiffres.length >= 6 ? [{ id: { in: await parTelephone(payload, chiffres.slice(-8)) } }] : []),
            ],
          },
        ],
      };
  const { docs } = await payload.find({ collection: 'commandes', where: where as never, sort: '-createdAt', limit: 30, depth: 0 });
  return (docs as Commande[]).map((c) => enCaisse(c));
}

/** Encaissements du jour (heure de Libreville) d'un caissier : nombre et total, pour sa caisse. */
export async function journeeDuCaissier(payload: Payload, agentId: number, maintenant = new Date()) {
  const debut = minuitLibreville(jourLibreville(maintenant));
  const { docs } = await payload.find({
    collection: 'commandes',
    where: { and: [{ 'paiement.encaisseParId': { equals: agentId } }, { 'paiement.payeeA': { greater_than_equal: debut.toISOString() } }] },
    limit: 1000,
    depth: 0,
    pagination: false,
  });
  return { nombre: docs.length, totalXAF: docs.reduce((s, c) => s + c.totalXAF, 0) };
}

/**
 * Le caissier valide l'encaissement du montant exact : commande payée, billets émis et envoyés.
 * Une seule validation possible (transition conditionnelle) : deux caissiers sur la même
 * commande, un seul encaissement.
 */
export async function encaisserEspeces(payload: Payload, numero: string, montantXAF: number, agent: { id: number; nom: string }) {
  const agentId = agent.id;
  let c = await commandeParNumero(payload, numero);
  if (!c || !estEnEspeces(c)) throw new ErreurVente('Commande introuvable parmi les paiements en espèces.', 404);
  if (c.statut === 'payee') throw new ErreurVente(`Commande déjà encaissée${c.paiement?.payeeA ? ` le ${jourHeure.format(new Date(c.paiement.payeeA))}` : ''}.`, 409);
  await expirerReservations(payload);
  c = (await commandeParNumero(payload, numero))!;
  if (c.statut === 'expiree') throw new ErreurVente('Délai de paiement dépassé : la commande est annulée et ses places ont été rendues à la vente. Refaites la commande avec le client.', 409);
  if (c.statut !== 'en_attente') throw new ErreurVente('Cette commande n’est plus en attente de paiement.', 409);
  if (montantXAF !== c.totalXAF) throw new ErreurVente(`Montant à encaisser : ${formaterXAF(c.totalXAF)}.`, 400);
  if (!(await transition(payload, c.id, 'payee'))) throw new ErreurVente('Cette commande vient d’être traitée : actualisez.', 409);

  const reglages = await reglagesEspeces(payload);
  await payload.update({
    collection: 'commandes',
    id: c.id,
    data: { paiement: { prestataire: PRESTATAIRE_ESPECES, moyen: 'especes', detail: `Espèces — ${reglages.lieu}`, payeeA: new Date().toISOString(), encaissePar: agent.nom, encaisseParId: agentId } },
  });
  await payload.create({
    collection: 'journal-actions',
    data: { utilisateur: agentId, action: 'encaissement en espèces', collection: 'commandes', document: String(c.id), details: { numero: c.numero, montantXAF: c.totalXAF } },
  });
  await emettre(payload, c.id);
  const payee = (await commandeParNumero(payload, numero))!;
  return { commande: enCaisse(payee), ...(await envoiBillets(payload, payee)) };
}
