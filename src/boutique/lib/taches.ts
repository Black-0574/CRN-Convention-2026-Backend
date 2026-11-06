/**
 * Tâches planifiées du serveur (une seule instance applicative au Palier 1) :
 * - expiration des réservations échues, chaque minute (F03 : libération automatique) ;
 * - réconciliation des paiements en attente avec le prestataire (rattrapage d'un webhook perdu).
 */
import type { Payload } from 'payload';

import { prestataire, depot } from './paiement';
import { expirerReservations } from './ventes';

let demarre = false;

export function demarrerTachesPlanifiees(payload: Payload): void {
  if (demarre || process.env.TACHES_DESACTIVEES === '1') return;
  demarre = true;
  setInterval(() => {
    expirerReservations(payload)
      .then((n) => n && payload.logger.info(`${n} réservation(s) expirée(s) et libérée(s).`))
      .catch((e) => payload.logger.error(`Expiration des réservations : ${(e as Error).message}`));
  }, 60_000).unref();
  // SasPay recommande de relire le statut en filet de sécurité (webhook perdu ou pas encore
  // configuré) : commandes SasPay en attente relues toutes les 2 minutes.
  if (process.env.PAIEMENT_PRESTATAIRE === 'saspay') {
    setInterval(() => {
      reconcilier(payload, 'saspay')
        .then((r) => r.corrigees && payload.logger.info(`SasPay : ${r.corrigees} commande(s) mise(s) à jour.`))
        .catch((e) => payload.logger.error(`Réconciliation SasPay : ${(e as Error).message}`));
    }, 120_000).unref();
  }
}

/**
 * Réconciliation : interroge le prestataire pour chaque commande en attente qui a une référence
 * de paiement, et applique le statut obtenu comme le ferait un webhook (mêmes règles, idempotent).
 * `seulementPrestataire` : restreint aux commandes d'un prestataire (notification SasPay).
 * Les commandes expirées depuis moins de 24 h sont relues aussi : un paiement confirmé juste avant
 * l'expiration de la réservation ne doit jamais passer inaperçu (la commande passe alors « à
 * vérifier », règle du cœur métier).
 */
export async function reconcilier(payload: Payload, seulementPrestataire?: string): Promise<{ verifiees: number; corrigees: number }> {
  const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const enAttente = await payload.find({
    collection: 'commandes',
    where: {
      and: [
        { 'paiement.referenceExterne': { exists: true } },
        ...(seulementPrestataire ? [{ 'paiement.prestataire': { equals: seulementPrestataire } }] : []),
        { or: [{ statut: { equals: 'en_attente' } }, { and: [{ statut: { equals: 'expiree' } }, { createdAt: { greater_than: depuis } }] }] },
      ],
    },
    limit: 500,
    depth: 0,
  });
  let corrigees = 0;
  for (const c of enAttente.docs) {
    const nom = c.paiement?.prestataire;
    const ref = c.paiement?.referenceExterne;
    if (!nom || !ref) continue;
    // Commande expirée dont l'échec est déjà connu : inutile d'interroger le prestataire à nouveau.
    if (c.statut === 'expiree' && (await payload.count({ collection: 'evenements-webhook', where: { cle: { equals: `${nom}:reconciliation:${ref}:echouee` } } })).totalDocs) continue;
    const p = prestataire(nom);
    let statut;
    try {
      statut = await p.statut(ref);
    } catch (e) {
      // 429 : limite de débit du prestataire atteinte, on s'arrête là (reprise au passage suivant).
      if ((e as { code?: number }).code === 429) {
        payload.logger.warn(`${nom} : limite de débit atteinte, réconciliation reportée.`);
        break;
      }
      payload.logger.error(`${nom} : statut de ${c.numero} illisible (${(e as Error).message}).`);
      continue;
    }
    if (statut === 'en_attente') continue;
    const d = depot(payload, nom);
    const infos = statut === 'payee' ? p.informations?.(ref) : undefined;
    const evt = {
      idEvenement: `reconciliation:${ref}:${statut}`,
      referenceCommande: c.numero,
      referenceExterne: ref,
      statut,
      montantXAF: c.totalXAF,
      ...(infos?.detail ? { detail: infos.detail } : {}),
      ...(infos?.moyen ? { moyen: infos.moyen } : {}),
    };
    if (await d.enregistrerEvenement(p.nom, evt)) {
      const { deciderTransition } = await import('../domaine/src/index.ts');
      const commande = await d.commande(c.numero);
      if (!commande) continue;
      const decision = deciderTransition(commande, evt);
      if (decision.action !== 'ignorer') {
        await d.appliquer(c.numero, decision, evt);
        corrigees++;
      }
    }
  }
  return { verifiees: enAttente.docs.length, corrigees };
}

/**
 * Réconciliation déclenchée par une notification (webhook) : lancée en arrière-plan pour répondre
 * tout de suite au prestataire (SasPay coupe à 15 s), et en file — une rafale de notifications ne
 * lance jamais plusieurs relectures en parallèle.
 */
let file: Promise<unknown> = Promise.resolve();

export function reconcilierEnArrierePlan(payload: Payload, nomPrestataire: string): void {
  file = file
    .then(() => reconcilier(payload, nomPrestataire))
    .then((r) => r.corrigees && payload.logger.info(`${nomPrestataire} : ${r.corrigees} commande(s) mise(s) à jour après notification.`))
    .catch((e) => payload.logger.error(`Réconciliation ${nomPrestataire} : ${(e as Error).message}`));
}

/** Attend la fin des réconciliations en file (tests). */
export const reconciliationsTerminees = (): Promise<unknown> => file;
