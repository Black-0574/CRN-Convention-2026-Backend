/**
 * Raccordement des prestataires de paiement (interface `PaymentProvider` du cœur métier) et dépôt
 * des événements en base. Le prestataire actif se choisit par variable d'environnement : aucun
 * n'est codé en dur. L'agrégateur retenu couvrira plusieurs pays (Mobile Money des différents
 * opérateurs et carte bancaire) ; tant que le CRN ne l'a pas choisi et n'a pas fourni ses
 * identifiants (question bloquante n° 4), seul le « bac à sable » est disponible, avec une page de
 * paiement simulée (`/paiement-simule` du back-office).
 */
import { BacASable, type DepotPaiements, type Decision, type EvenementPaiement, type PaymentProvider } from '../domaine/src/index.ts';
import type { Payload } from 'payload';

import { emettre } from './emission';
import { urlBackOffice } from './urls';
import { lignes, maintenant, sql } from './db';
import { expirerReservations, liberer, transition } from './ventes';

let bacASable: BacASable | null = null;

export function prestataire(nom = process.env.PAIEMENT_PRESTATAIRE || 'bac-a-sable'): PaymentProvider {
  if (nom === 'bac-a-sable') {
    if (process.env.NODE_ENV === 'production') throw new Error('Le prestataire « bac à sable » est interdit en production.');
    bacASable ??= new BacASable(
      process.env.PAIEMENT_BAC_A_SABLE_SECRET || 'secret-bac-a-sable-local-uniquement',
      (ref, demande) => `${urlBackOffice()}/paiement-simule?ref=${encodeURIComponent(ref)}&retour=${encodeURIComponent(demande.urlRetour)}`,
    );
    return bacASable;
  }
  throw new Error(`Prestataire de paiement inconnu : « ${nom} » (agrégateur de paiement à raccorder).`);
}

export const bacASableActif = (): BacASable => prestataire('bac-a-sable') as BacASable;

export function depot(payload: Payload, nomPrestataire: string): DepotPaiements {
  return {
    async enregistrerEvenement(fournisseur, evt: EvenementPaiement) {
      try {
        await payload.create({
          collection: 'evenements-webhook',
          data: { cle: `${fournisseur}:${evt.idEvenement}`, referenceCommande: evt.referenceCommande, statut: evt.statut, montantXAF: evt.montantXAF, brut: evt as never },
        });
        return true;
      } catch {
        return false; // contrainte d'unicité : déjà reçu
      }
    },
    async commande(reference) {
      // Une réservation échue est expirée avant de décider : jamais d'encaissement silencieux
      // sur des places déjà rendues à la vente.
      await expirerReservations(payload);
      const { docs } = await payload.find({ collection: 'commandes', where: { numero: { equals: reference } }, limit: 1, depth: 0 });
      const c = docs[0];
      return c ? { statut: c.statut, montantXAF: c.totalXAF } : null;
    },
    async appliquer(reference, decision: Exclude<Decision, { action: 'ignorer' }>, evt: EvenementPaiement) {
      const [c] = await lignes<{ id: number }>(payload, sql`SELECT id FROM commandes WHERE numero = ${reference}`);
      if (!c) return;
      if (decision.action === 'anomalie') {
        await lignes(payload, sql`UPDATE commandes SET statut = 'a_verifier', anomalie = ${`${nomPrestataire} : ${decision.raison}`}, updated_at = ${maintenant()} WHERE id = ${c.id}`);
        return;
      }
      if (decision.statut === 'payee') {
        if (await transition(payload, c.id, 'payee')) {
          await payload.update({
            collection: 'commandes',
            id: c.id,
            data: { paiement: { payeeA: new Date().toISOString(), ...(evt.moyen ? { moyen: evt.moyen } : {}), ...(evt.detail ? { detail: evt.detail } : {}) } },
          });
          await emettre(payload, c.id);
        }
      } else if (decision.statut === 'echouee') {
        if (await transition(payload, c.id, 'echouee')) await liberer(payload, c.id);
      } else if (decision.statut === 'remboursee') {
        await lignes(payload, sql`UPDATE commandes SET statut = 'remboursee', updated_at = ${maintenant()} WHERE id = ${c.id}`);
        await lignes(payload, sql`UPDATE droits_acces SET statut = 'annule' WHERE titulaire_id IN (SELECT id FROM titulaires WHERE commande_id = ${c.id}) AND statut = 'valide'`);
      }
    },
  };
}
