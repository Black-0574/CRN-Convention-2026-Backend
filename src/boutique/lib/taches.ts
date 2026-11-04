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
}

/**
 * Réconciliation : interroge le prestataire pour chaque commande en attente qui a une référence
 * de paiement, et applique le statut obtenu comme le ferait un webhook (mêmes règles, idempotent).
 */
export async function reconcilier(payload: Payload): Promise<{ verifiees: number; corrigees: number }> {
  const enAttente = await payload.find({
    collection: 'commandes',
    where: { statut: { equals: 'en_attente' }, 'paiement.referenceExterne': { exists: true } },
    limit: 500,
    depth: 0,
  });
  let corrigees = 0;
  for (const c of enAttente.docs) {
    const nom = c.paiement?.prestataire;
    const ref = c.paiement?.referenceExterne;
    if (!nom || !ref) continue;
    const p = prestataire(nom);
    const statut = await p.statut(ref);
    if (statut === 'en_attente') continue;
    const d = depot(payload, nom);
    const evt = { idEvenement: `reconciliation:${ref}:${statut}`, referenceCommande: c.numero, referenceExterne: ref, statut, montantXAF: c.totalXAF };
    if (await d.enregistrerEvenement(p.nom, evt)) {
      const { deciderTransition } = await import('../domaine/src/index.ts');
      const commande = await d.commande(c.numero);
      if (!commande) continue;
      const decision = deciderTransition(commande, evt);
      if (decision.action !== 'ignorer') {
        await d.appliquer(c.numero, decision);
        corrigees++;
      }
    }
  }
  return { verifiees: enAttente.docs.length, corrigees };
}
