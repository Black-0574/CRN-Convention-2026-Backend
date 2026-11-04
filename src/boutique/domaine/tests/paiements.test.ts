import { beforeEach, describe, expect, it } from 'vitest';
import {
  BacASable,
  deciderTransition,
  traiterWebhook,
  type DepotPaiements,
  type EvenementPaiement,
  type StatutCommande,
} from '../src/paiements.ts';

// Dépôt en mémoire reproduisant la contrainte d'unicité (fournisseur, idEvenement) de la base.
class DepotMemoire implements DepotPaiements {
  evenements = new Set<string>();
  commandes = new Map<string, { statut: StatutCommande; montantXAF: number }>();
  async enregistrerEvenement(f: string, e: EvenementPaiement) {
    const cle = `${f}:${e.idEvenement}`;
    if (this.evenements.has(cle)) return false;
    this.evenements.add(cle);
    return true;
  }
  async commande(ref: string) {
    return this.commandes.get(ref) ?? null;
  }
  moyens = new Map<string, string | undefined>();
  async appliquer(ref: string, d: { statut: StatutCommande }, e: EvenementPaiement) {
    const c = this.commandes.get(ref)!;
    this.commandes.set(ref, { ...c, statut: d.statut });
    this.moyens.set(ref, e.detail);
  }
}

const evt = (o: Partial<EvenementPaiement> = {}): EvenementPaiement => ({
  idEvenement: 'evt-1',
  referenceCommande: 'CRN-0001',
  referenceExterne: 'BAS-CRN-0001-1',
  statut: 'payee',
  montantXAF: 150_000,
  ...o,
});

describe('webhooks de paiement', () => {
  let bas: BacASable;
  let depot: DepotMemoire;
  beforeEach(() => {
    bas = new BacASable('secret-webhook-de-test');
    depot = new DepotMemoire();
    depot.commandes.set('CRN-0001', { statut: 'en_attente', montantXAF: 150_000 });
  });

  it('paiement confirmé : la commande passe à « payée »', async () => {
    const { corps, entetes } = bas.webhook(evt());
    expect(await traiterWebhook(bas, depot, corps, entetes)).toEqual({ code: 200, resultat: 'applique' });
    expect(depot.commandes.get('CRN-0001')?.statut).toBe('payee');
  });

  it('signature invalide : 401, rien n’est enregistré ni modifié', async () => {
    const { corps } = bas.webhook(evt());
    expect(await traiterWebhook(bas, depot, corps, { 'x-crn-signature': 'sha256=' + '0'.repeat(64) })).toEqual({ code: 401, resultat: 'signature_invalide' });
    expect(await traiterWebhook(bas, depot, corps, {})).toEqual({ code: 401, resultat: 'signature_invalide' });
    const { entetes } = bas.webhook(evt());
    expect(await traiterWebhook(bas, depot, corps.replace('150000', '15000'), entetes)).toMatchObject({ code: 401 });
    expect(depot.evenements.size).toBe(0);
    expect(depot.commandes.get('CRN-0001')?.statut).toBe('en_attente');
  });

  it('doublon (rejeu du même événement) : traité une seule fois', async () => {
    const { corps, entetes } = bas.webhook(evt());
    await traiterWebhook(bas, depot, corps, entetes);
    expect(await traiterWebhook(bas, depot, corps, entetes)).toEqual({ code: 200, resultat: 'doublon' });
  });

  it('désordre : un échec arrivé après la confirmation ne l’annule pas', async () => {
    const ok = bas.webhook(evt({ idEvenement: 'evt-ok' }));
    const ko = bas.webhook(evt({ idEvenement: 'evt-ko', statut: 'echouee' }));
    await traiterWebhook(bas, depot, ok.corps, ok.entetes);
    expect(await traiterWebhook(bas, depot, ko.corps, ko.entetes)).toEqual({ code: 200, resultat: 'ignore' });
    expect(depot.commandes.get('CRN-0001')?.statut).toBe('payee');
  });

  it('commande inconnue : 200 (le prestataire cesse de relancer), sans effet', async () => {
    const { corps, entetes } = bas.webhook(evt({ referenceCommande: 'CRN-9999' }));
    expect(await traiterWebhook(bas, depot, corps, entetes)).toEqual({ code: 200, resultat: 'commande_inconnue' });
  });
});

describe('agrégateur multi-pays (Mobile Money et carte)', () => {
  it('ouvre une session et renvoie vers la page de paiement de l’agrégateur', async () => {
    const bas = new BacASable('secret', (ref, d) => `https://paiement.test/?ref=${ref}&retour=${encodeURIComponent(d.urlRetour)}`);
    const { referenceExterne, redirection } = await bas.creerPaiement({
      referenceCommande: 'CRN-0002',
      montantXAF: 25_000,
      email: 'a@exemple.org',
      description: 'Commande CRN-0002',
      urlRetour: 'https://site.test/boutique/suivi?commande=CRN-0002',
    });
    expect(referenceExterne).toMatch(/^BAS-CRN-0002-/);
    expect(redirection).toContain(`ref=${referenceExterne}`);
  });

  it('transmet au dépôt le moyen choisi par le client (opérateur d’un autre pays, carte)', async () => {
    const bas = new BacASable('secret');
    const depot = new DepotMemoire();
    depot.commandes.set('CRN-0001', { statut: 'en_attente', montantXAF: 150_000 });
    const { corps, entetes } = bas.webhook(evt({ moyen: 'mobile_money', detail: 'MTN MoMo — Cameroun' }));
    expect(await traiterWebhook(bas, depot, corps, entetes)).toEqual({ code: 200, resultat: 'applique' });
    expect(depot.moyens.get('CRN-0001')).toBe('MTN MoMo — Cameroun');
  });
});

describe('transitions de commande', () => {
  it('argent reçu après expiration de la réservation : « à vérifier », jamais de survente silencieuse', () => {
    expect(deciderTransition({ statut: 'expiree', montantXAF: 150_000 }, evt())).toMatchObject({ action: 'anomalie', statut: 'a_verifier' });
    expect(deciderTransition({ statut: 'echouee', montantXAF: 150_000 }, evt())).toMatchObject({ action: 'anomalie' });
  });
  it('montant différent du montant attendu : « à vérifier »', () => {
    expect(deciderTransition({ statut: 'en_attente', montantXAF: 150_000 }, evt({ montantXAF: 120_000 }))).toMatchObject({ action: 'anomalie' });
  });
  it('remboursement d’une commande payée', () => {
    expect(deciderTransition({ statut: 'payee', montantXAF: 150_000 }, evt({ statut: 'remboursee' }))).toEqual({ action: 'appliquer', statut: 'remboursee' });
  });
  it('échec sur une commande en attente', () => {
    expect(deciderTransition({ statut: 'en_attente', montantXAF: 150_000 }, evt({ statut: 'echouee' }))).toEqual({ action: 'appliquer', statut: 'echouee' });
  });
});
