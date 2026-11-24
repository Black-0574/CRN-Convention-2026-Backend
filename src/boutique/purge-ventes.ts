import { existsSync } from 'node:fs';
import type { CollectionSlug, Payload } from 'payload';

import { lignes, sql } from './lib/db';

/**
 * Mise en production de la boutique (24 novembre 2026, demande du Commanditaire) : purge, une seule
 * fois, des données de vente accumulées pendant les tests, puis remise à zéro des compteurs
 * « vendus » et « réservés » des variantes et des quotas. Le catalogue, le contenu du site, les
 * comptes de l'équipe et le journal des actions ne sont pas touchés.
 *
 * Garde-fous :
 * - une seule fois : la purge est inscrite au journal des actions, qui ne se modifie pas depuis l'admin ;
 * - sauvegarde complète de la base (`VACUUM INTO`) à côté du fichier de la base avant toute
 *   suppression ; sans sauvegarde, rien n'est supprimé ;
 * - rien n'est supprimé si une commande a été créée après AVANT (vente réelle après la mise en ligne).
 */
const ACTION = 'purge des ventes de test (mise en production)';
const AVANT = '2026-11-24T18:00:00.000Z';
const SAUVEGARDE = 'avant-purge-ventes-2026-11-24';

/** Données de vente, des dépendantes aux commandes. */
const COLLECTIONS: CollectionSlug[] = [
  'scans',
  'retraits',
  'droits-acces',
  'consentements',
  'reservations',
  'titulaires',
  'evenements-webhook',
  'commandes',
];

/** Fichier de sauvegarde à côté de la base (`file:/…/crn-convention.db` → `/…/crn-convention-avant-purge-….db`). */
function cheminSauvegarde(): string {
  const base = (process.env.DATABASE_URI || 'file:./crn-convention.db').replace(/^file:/, '');
  return base.replace(/(\.db)?$/, `-${SAUVEGARDE}.db`);
}

export async function purgerVentesDeTest(payload: Payload): Promise<void> {
  const deja = await payload.count({ collection: 'journal-actions', where: { action: { equals: ACTION } } });
  if (deja.totalDocs > 0) return;

  const recentes = await payload.count({ collection: 'commandes', where: { createdAt: { greater_than_equal: AVANT } } });
  if (recentes.totalDocs > 0) {
    payload.logger.error(`Purge des ventes annulée : ${recentes.totalDocs} commande(s) créée(s) après le ${AVANT}.`);
    return;
  }

  const sauvegarde = cheminSauvegarde();
  if (!existsSync(sauvegarde)) await lignes(payload, sql`VACUUM INTO ${sauvegarde}`);
  if (!existsSync(sauvegarde)) {
    payload.logger.error(`Purge des ventes annulée : sauvegarde ${sauvegarde} introuvable.`);
    return;
  }

  const supprimes: Record<string, number> = {};
  for (const collection of COLLECTIONS) {
    const { docs, errors } = await payload.delete({ collection, where: { id: { exists: true } } });
    if (errors.length) throw new Error(`${collection} : ${errors.map((e) => e.message).join(' ; ')}`);
    supprimes[collection] = docs.length;
  }
  await lignes(payload, sql`UPDATE variantes SET stock_vendu = 0, stock_reserve = 0`);
  await lignes(payload, sql`UPDATE quotas SET vendus = 0, reserves = 0`);

  await payload.create({
    collection: 'journal-actions',
    data: { action: ACTION, collection: 'commandes', details: { supprimes, compteursRemisAZero: true, sauvegarde } },
  });
  payload.logger.info(`Ventes de test purgées : ${JSON.stringify(supprimes)} ; sauvegarde ${sauvegarde}.`);
}
