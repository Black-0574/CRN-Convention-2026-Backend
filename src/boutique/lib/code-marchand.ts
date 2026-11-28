/**
 * Paiement Mobile Money par code marchand (Commanditaire, 28 novembre 2026) : alternative au
 * paiement en ligne quand celui-ci échoue (Airtel Money notamment), sur le modèle des espèces.
 *
 * 1. Le client choisit « Code marchand » et son opérateur (Airtel Money, Moov Money / Mobicash) :
 *    places, articles et prix restent réservés 48 heures.
 * 2. Il paie depuis son téléphone (procédure USSD affichée, montant exact, numéro de commande en
 *    référence), puis envoie sur le suivi de sa commande la capture du SMS de confirmation et
 *    l'identifiant de transaction. La réservation est alors prolongée pour la vérification.
 * 3. La COM Boutique vérifie la réception **sur le compte marchand** (une capture se falsifie) et
 *    valide à la caisse : billets émis et envoyés, articles à remettre, comme pour les espèces.
 *
 * Une commande dont un paiement en ligne avait été ouvert est d'abord relue chez le prestataire :
 * un paiement en ligne confirmé entre-temps n'est jamais perdu.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { formaterXAF } from '../domaine/src/index.ts';
import type { Payload } from 'payload';

import type { Commande } from '../../payload-types';
import { lignes, sql } from './db';
import { echapper, EXPEDITEUR_BOUTIQUE, gabarit, messagerie } from './messagerie';
import { urlBackOffice, urlSuivi } from './urls';
import { relireSansDelai } from './taches';
import { ErreurVente } from './ventes';

export const PRESTATAIRE_CODE_MARCHAND = 'code_marchand';
/** Délai pour payer et envoyer la preuve (choix du Commanditaire). */
export const DELAI_PAIEMENT_HEURES = 48;
/** Réservation prolongée à la réception de la preuve, le temps que la COM Boutique vérifie. */
export const DELAI_VERIFICATION_HEURES = 72;
export const STATUT_EVENEMENT_CODE_MARCHAND = 'Payé par code marchand (vérifié par la COM Boutique)';

export type Operateur = 'airtel' | 'moov';

/** Procédures fournies par le Commanditaire (28 novembre 2026). */
export const OPERATEURS: Record<Operateur, { nom: string; ussd: string; codeCommercant: string; etapes: (montant: string, numero: string) => string[] }> = {
  airtel: {
    nom: 'Airtel Money',
    ussd: '*150#',
    codeCommercant: 'CRN',
    etapes: (montant, numero) => [
      'Composez *150#',
      'Sélectionnez 3 (Paiement)',
      'Sélectionnez 10 (Autres biens et services)',
      'Tapez le code commerçant : CRN',
      `Entrez le montant : ${montant}`,
      `Entrez la référence : ${numero}`,
      'Entrez votre code PIN',
    ],
  },
  moov: {
    nom: 'Moov Money (Mobicash)',
    ussd: '*555#',
    codeCommercant: 'CRN26',
    etapes: (montant) => ['Composez *555#', 'Sélectionnez 5 (Paiement)', 'Sélectionnez 1 (Payer Commerçant)', 'Entrez le code commerçant : CRN26', `Entrez le montant : ${montant}`, 'Entrez votre code PIN'],
  },
};

export const estOperateur = (v: unknown): v is Operateur => v === 'airtel' || v === 'moov';
export const estEnCodeMarchand = (c: Pick<Commande, 'paiement'>) => c.paiement?.prestataire === PRESTATAIRE_CODE_MARCHAND;

/** Procédure à afficher au client : montant en chiffres seuls (tel qu'on le tape au téléphone). */
export function procedure(c: Pick<Commande, 'numero' | 'totalXAF' | 'codeMarchand'>) {
  const op = estOperateur(c.codeMarchand?.operateur) ? c.codeMarchand.operateur : null;
  if (!op) return null;
  const o = OPERATEURS[op];
  return { operateur: op, nom: o.nom, ussd: o.ussd, codeCommercant: o.codeCommercant, etapes: o.etapes(String(c.totalXAF), c.numero) };
}

/**
 * Dossier des preuves de paiement : chemin absolu persistant en production (à côté de MEDIA_DIR,
 * comme les billets), jamais servi publiquement.
 */
export const DOSSIER_PREUVES =
  process.env.PREUVES_DIR ||
  (process.env.MEDIA_DIR && path.isAbsolute(process.env.MEDIA_DIR) ? path.join(path.dirname(process.env.MEDIA_DIR), 'preuves-paiement') : path.resolve(process.cwd(), '.preuves'));

const TAILLE_MAX = 5 * 1024 * 1024;
/** Formats acceptés, reconnus à leurs premiers octets (jamais au nom ni au type annoncé). */
function formatImage(b: Buffer): { ext: string; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

export async function lirePreuve(fichier: string): Promise<{ donnees: Buffer; type: string }> {
  const donnees = await readFile(path.join(DOSSIER_PREUVES, path.basename(fichier)));
  return { donnees, type: formatImage(donnees)?.type ?? 'application/octet-stream' };
}

const jourHeure = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' });

async function prolonger(payload: Payload, c: Commande, echeance: string) {
  await lignes(payload, sql`UPDATE reservations SET expire_a = ${echeance} WHERE commande_id = ${c.id} AND statut = 'active'`);
}

/** Le client choisit le paiement par code marchand : réservation prolongée de 48 heures. */
export async function choisirCodeMarchand(payload: Payload, commande: Commande, operateur: unknown, maintenant = new Date()): Promise<Commande> {
  if (!estOperateur(operateur)) throw new ErreurVente('Choisissez Airtel Money ou Moov Money.');
  let c = commande;
  // Paiement en ligne déjà ouvert : relu d'abord, pour ne jamais perdre un paiement confirmé.
  if (c.paiement?.referenceExterne && c.statut === 'en_attente') {
    await relireSansDelai(payload, c as never);
    c = (await payload.findByID({ collection: 'commandes', id: c.id, depth: 0 })) as Commande;
    if (c.statut === 'payee') throw new ErreurVente('Votre paiement en ligne vient d’être confirmé : vos billets sont prêts, inutile de payer à nouveau.', 409);
  }
  if (c.statut !== 'en_attente') throw new ErreurVente('Cette commande n’est plus en attente de paiement : recommencez votre commande.', 409);
  if (c.paiement?.prestataire === 'especes') throw new ErreurVente('Cette commande est à régler en espèces à la caisse de la COM Boutique.', 409);
  if (c.reservationExpireA && new Date(c.reservationExpireA) < maintenant) throw new ErreurVente('Le délai de réservation est dépassé : recommencez votre commande.', 409);

  const echeance = new Date(maintenant.getTime() + DELAI_PAIEMENT_HEURES * 3600 * 1000).toISOString();
  await prolonger(payload, c, echeance);
  const maj = (await payload.update({
    collection: 'commandes',
    id: c.id,
    data: {
      reservationExpireA: echeance,
      // Session en ligne détachée (gardée pour mémoire) : la réconciliation ne la relit plus.
      paiement: { prestataire: PRESTATAIRE_CODE_MARCHAND, referenceExterne: null },
      codeMarchand: {
        operateur,
        choisiLe: maintenant.toISOString(),
        ...(c.paiement?.referenceExterne ? { sessionEnLigne: `${c.paiement.prestataire ?? ''}:${c.paiement.referenceExterne}` } : {}),
      },
    },
  })) as Commande;

  const p = procedure(maj)!;
  if (maj.email) {
    await messagerie
      .envoyer({
        a: maj.email,
        reference: maj.numero,
        sujet: `Commande ${maj.numero} à régler par ${p.nom} — Convention CRN 2026`,
        html: gabarit(
          `Commande ${maj.numero}`,
          `<p>Bonjour ${echapper(maj.prenom)},</p>
<p>Votre commande est réservée jusqu’au <strong>${jourHeure.format(new Date(echeance))}</strong>. Réglez <strong>${formaterXAF(maj.totalXAF)}</strong> par ${p.nom}, depuis votre téléphone :</p>
<ol>${p.etapes.map((e) => `<li>${echapper(e)}</li>`).join('')}</ol>
<p>Ensuite, envoyez la capture du SMS de confirmation et l’identifiant de transaction sur la page de suivi de votre commande. Vos billets partent dès que la boutique a vérifié le paiement.</p>
<p><a href="${urlSuivi(maj.numero, maj.jetonSuivi)}" style="color:#1A2C5B;font-weight:700">Envoyer ma preuve de paiement</a></p>`,
        ),
      })
      .catch((e) => payload.logger.error(`E-mail « code marchand » ${maj.numero} non envoyé : ${(e as Error).message}`));
  }
  return maj;
}

/** Preuve de paiement envoyée par le client (capture et identifiant de transaction). */
export async function recevoirPreuve(payload: Payload, c: Commande, fichier: Blob | null, idTransaction: unknown, maintenant = new Date()): Promise<Commande> {
  if (!estEnCodeMarchand(c)) throw new ErreurVente('Cette commande n’est pas à régler par code marchand.', 409);
  if (c.statut === 'payee') throw new ErreurVente('Paiement déjà vérifié : vos billets sont prêts.', 409);
  if (c.statut !== 'en_attente') throw new ErreurVente('Cette commande n’est plus en attente de paiement : contactez la boutique.', 409);
  const id = typeof idTransaction === 'string' ? idTransaction.trim().slice(0, 80) : '';
  if (id.length < 4) throw new ErreurVente('Indiquez l’identifiant de transaction reçu par SMS.');
  if (!fichier || fichier.size === 0) throw new ErreurVente('Joignez la capture du SMS de confirmation.');
  if (fichier.size > TAILLE_MAX) throw new ErreurVente('Capture trop lourde (5 Mo au plus).');
  const donnees = Buffer.from(await fichier.arrayBuffer());
  const format = formatImage(donnees);
  if (!format) throw new ErreurVente('Format non reconnu : envoyez une image (JPEG, PNG ou WebP).');

  await mkdir(DOSSIER_PREUVES, { recursive: true });
  const nom = `${c.numero.replace(/[^\w-]/g, '_')}-${randomBytes(6).toString('hex')}.${format.ext}`;
  await writeFile(path.join(DOSSIER_PREUVES, nom), donnees);

  // Le client a payé : la réservation tient le temps de la vérification.
  const verification = new Date(maintenant.getTime() + DELAI_VERIFICATION_HEURES * 3600 * 1000).toISOString();
  const echeance = c.reservationExpireA && c.reservationExpireA > verification ? c.reservationExpireA : verification;
  await prolonger(payload, c, echeance);
  const maj = (await payload.update({
    collection: 'commandes',
    id: c.id,
    data: { reservationExpireA: echeance, codeMarchand: { ...c.codeMarchand, idTransaction: id, preuve: nom, preuveRecueLe: maintenant.toISOString() } },
  })) as Commande;

  const p = procedure(maj);
  await messagerie
    .envoyer({
      a: EXPEDITEUR_BOUTIQUE,
      reference: maj.numero,
      sujet: `Preuve de paiement à vérifier — ${maj.numero} (${p?.nom ?? 'code marchand'})`,
      html: gabarit(
        `Preuve de paiement — ${maj.numero}`,
        `<p>${echapper(`${maj.prenom} ${maj.nom}`)} a envoyé une preuve de paiement de <strong>${formaterXAF(maj.totalXAF)}</strong> par ${p?.nom ?? 'code marchand'} (transaction <strong>${echapper(id)}</strong>).</p>
<p>Vérifiez la réception sur le compte marchand, puis validez la commande à la caisse.</p>
<p><a href="${urlBackOffice()}/caisse" style="color:#1A2C5B;font-weight:700">Ouvrir la caisse</a></p>`,
      ),
    })
    .catch((e) => payload.logger.error(`Alerte « preuve reçue » ${maj.numero} non envoyée : ${(e as Error).message}`));
  return maj;
}
