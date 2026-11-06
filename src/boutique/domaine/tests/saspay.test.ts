import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { ErreurSasPay, SasPay, type ConfigSasPay } from '../src/saspay.ts';

// Réponses calquées sur les exemples de la documentation SasPay (docs.saspay.me, 6 novembre 2026).
const CLE = 'sk_test_0123456789abcdef';
const SECRET = 'whsec-de-test';
const MAINTENANT = Date.UTC(2026, 11, 8, 9, 0, 0);

interface Appel {
  url: string;
  methode: string;
  entetes: Record<string, string>;
  corps: Record<string, unknown> | null;
}

type Reponse = { statut?: number; corps: unknown };

/** Faux SasPay : une réponse unique, ou une réponse choisie d'après l'adresse appelée. */
function sasPay(reponse: Reponse | ((url: string) => Reponse), options: Partial<ConfigSasPay> = {}) {
  const appels: Appel[] = [];
  const fauxFetch = (async (url: string, init: RequestInit) => {
    appels.push({ url, methode: init.method ?? 'GET', entetes: init.headers as Record<string, string>, corps: init.body ? JSON.parse(String(init.body)) : null });
    const r = typeof reponse === 'function' ? reponse(url) : reponse;
    return new Response(JSON.stringify(r.corps), { status: r.statut ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { p: new SasPay({ cleApi: CLE, secretWebhook: SECRET, fetch: fauxFetch, maintenant: () => MAINTENANT, ...options }), appels };
}

const demande = {
  referenceCommande: 'CRN-AB12CD',
  montantXAF: 150_000,
  telephone: '+24162705183',
  email: 'client@example.com',
  nom: 'Awa Sossou',
  description: 'Commande CRN-AB12CD — Boutique de la Convention CRN 2026',
  urlRetour: 'https://www.crn-convention2026.events/boutique/suivi?commande=CRN-AB12CD&t=x',
  expireA: '2026-12-08T09:15:00.000Z',
};

describe('SasPay — configuration', () => {
  it('refuse une clé absente ou qui n’est pas une clé secrète', () => {
    expect(() => new SasPay({ cleApi: '', secretWebhook: SECRET })).toThrow(/Clé API/);
    expect(() => new SasPay({ cleApi: 'pk_live_x', secretWebhook: SECRET })).toThrow(/Clé API/);
    expect(() => new SasPay({ cleApi: CLE, secretWebhook: '' })).toThrow(/Secret/);
  });

  it('distingue clé de test et clé de production', () => {
    expect(sasPay({ corps: {} }).p.modeTest).toBe(true);
    expect(sasPay({ corps: {} }, { cleApi: 'sk_live_abc' }).p.modeTest).toBe(false);
  });
});

describe('SasPay — création du paiement (checkout hébergé)', () => {
  const session = { id: 'c9a17e2c-4b1a-4f0e-9c3d-2a1b3c4d5e6f', checkout_url: 'https://pay.saspay.me/checkout/kZ2v9rT4bQxL8mNpYw==', status: 'PENDING' };

  it('ouvre une session en XAF, montant en chaîne décimale, et renvoie la page de paiement', async () => {
    const { p, appels } = sasPay({ statut: 201, corps: session }, { pays: 'GA', modeFrais: 'DEDUCTED' });
    const r = await p.creerPaiement(demande);
    expect(r).toEqual({ referenceExterne: session.id, redirection: session.checkout_url });
    expect(appels).toHaveLength(1);
    const [a] = appels;
    expect(a!.url).toBe('https://api.saspay.me/api/v1/checkout-sessions/');
    expect(a!.methode).toBe('POST');
    expect(a!.entetes.Authorization).toBe(`Bearer ${CLE}`);
    expect(a!.corps).toMatchObject({
      amount: '150000.00',
      currency: 'XAF',
      customer_email: 'client@example.com',
      customer_name: 'Awa Sossou',
      customer_phone: '+24162705183',
      return_url: demande.urlRetour,
      metadata: { reference_commande: 'CRN-AB12CD' },
      country: 'GA',
      fee_charge_mode: 'DEDUCTED',
      expires_at: demande.expireA,
    });
  });

  it('accepte aussi la réponse dans l’enveloppe { success, data }', async () => {
    const { p } = sasPay({ statut: 201, corps: { success: true, data: session, code: 201 } });
    expect((await p.creerPaiement(demande)).referenceExterne).toBe(session.id);
  });

  it('n’envoie ni pays ni mode de frais non configurés (réglages du compte SasPay)', async () => {
    const { p, appels } = sasPay({ statut: 201, corps: session });
    await p.creerPaiement(demande);
    expect(appels[0]!.corps).not.toHaveProperty('country');
    expect(appels[0]!.corps).not.toHaveProperty('fee_charge_mode');
  });

  it('remonte l’erreur de SasPay avec son code (clé refusée, scope insuffisant…)', async () => {
    const { p } = sasPay({ statut: 403, corps: { success: false, error: { message: 'Cette clé API n’est pas autorisée pour les opérations payin.', code: 'api_key_scope_forbidden' }, code: 403 } });
    const e = await p.creerPaiement(demande).catch((x) => x);
    expect(e).toBeInstanceOf(ErreurSasPay);
    expect(e.code).toBe(403);
    expect(e.codeSasPay).toBe('api_key_scope_forbidden');
  });

  it('refuse une session sans adresse de paiement', async () => {
    const { p } = sasPay({ statut: 201, corps: { id: session.id } });
    await expect(p.creerPaiement(demande)).rejects.toBeInstanceOf(ErreurSasPay);
  });
});

describe('SasPay — statut d’une session (relu chez l’opérateur, transaction vérifiée)', () => {
  const VERIFIEE = { status: 'SUCCESS', debited_amount: '153750.00', net_amount: '150000.00', client_fee: '3750.00', currency: 'XAF' };
  // [libellé, statut de session, statut de la transaction à la vérification, attendu]
  const cas: [string, Record<string, unknown>, Record<string, unknown> | null, string][] = [
    ['payée, transaction vérifiée SUCCESS', { status: 'PAID', transaction_id: 't1', transaction_status: 'SUCCESS' }, VERIFIEE, 'payee'],
    ['transaction réussie, session pas encore mise à jour', { status: 'PENDING', transaction_id: 't1', transaction_status: 'SUCCESS' }, VERIFIEE, 'payee'],
    ['session payée mais vérification encore PENDING', { status: 'PAID', transaction_id: 't1', transaction_status: 'SUCCESS' }, { status: 'PENDING' }, 'en_attente'],
    ['session payée mais vérification FAILED', { status: 'PAID', transaction_id: 't1', transaction_status: 'SUCCESS' }, { status: 'FAILED' }, 'en_attente'],
    ['session payée sans transaction connue', { status: 'PAID', transaction_id: null, transaction_status: null }, null, 'en_attente'],
    ['session expirée', { status: 'EXPIRED', transaction_status: null }, null, 'echouee'],
    ['session annulée', { status: 'CANCELLED', transaction_status: null }, null, 'echouee'],
    ['essai échoué, session encore ouverte (le client peut réessayer)', { status: 'PENDING', transaction_id: 't1', transaction_status: 'FAILED' }, null, 'en_attente'],
    ['aucun essai', { status: 'PENDING', transaction_status: null }, null, 'en_attente'],
  ];
  for (const [libelle, session, transaction, attendu] of cas) {
    it(`${libelle} → ${attendu}`, async () => {
      const { p, appels } = sasPay((url) => ({ corps: url.includes('/verify/') ? transaction : { id: 's1', ...session } }));
      expect(await p.statut('s1')).toBe(attendu);
      expect(appels[0]!.url).toBe('https://api.saspay.me/api/v1/checkout-sessions/s1/status/');
      if (transaction) expect(appels[1]!.url).toBe('https://api.saspay.me/api/v1/payments/t1/verify/');
    });
  }

  it('relève le montant débité et le net reçu (comptabilité), jamais le seul montant demandé', async () => {
    const { p } = sasPay((url) => ({ corps: url.includes('/verify/') ? VERIFIEE : { id: 's1', status: 'PAID', transaction_id: 't1' } }));
    expect(p.informations('s1')).toBeUndefined();
    await p.statut('s1');
    const i = p.informations('s1')!;
    expect(i).toMatchObject({ idTransaction: 't1', debiteXAF: 153_750, netXAF: 150_000 });
    expect(i.detail).toMatch(/débité 153 750 F CFA/);
    expect(i.detail).toMatch(/net reçu 150 000 F CFA/);
  });

  it('remonte la limite de débit (429) pour que la réconciliation s’arrête', async () => {
    const { p } = sasPay({ statut: 429, corps: { success: false, error: { message: 'Trop de requêtes', code: 'rate_limited' }, code: 429 } });
    await expect(p.statut('s1')).rejects.toMatchObject({ code: 429 });
  });
});

describe('SasPay — webhooks déclarés (contrôle de configuration)', () => {
  it('associe à chaque point de réception ses abonnements', async () => {
    const { p } = sasPay((url) => ({
      corps: url.endsWith('/merchant-webhooks/')
        ? { count: 1, results: [{ id: 'w1', url: 'https://admin.crn-convention2026.events/api/boutique/paiements/saspay/webhook', environment: 'TEST', is_active: true }] }
        : { count: 2, results: [{ webhook: 'w1', event_type: 'transaction.success' }, { webhook: 'w1', event_type: 'transaction.failed' }, { webhook: 'autre', event_type: 'settlement.success' }] },
    }));
    expect(await p.webhooks()).toEqual([
      { url: 'https://admin.crn-convention2026.events/api/boutique/paiements/saspay/webhook', environnement: 'TEST', actif: true, evenements: ['transaction.success', 'transaction.failed'] },
    ]);
  });
});

describe('SasPay — réseaux ouverts au compte (contrôle de configuration)', () => {
  it('lit disponibilité, OTP et plafond par paiement', async () => {
    const { p, appels } = sasPay({
      corps: [
        { country_code: 'GA', country_name: 'Gabon', currency: 'XAF', network_code: 'airtel_ga', network_name: 'Airtel Money', payin: { available: true, otp_required: false, tiers: [{ max_amount: '500000.00' }, { max_amount: '2000000.00' }] } },
        { country_code: 'GA', country_name: 'Gabon', currency: 'XAF', network_code: 'moov_ga', network_name: 'Moov Money', payin: { available: false, otp_required: false, tiers: [{ max_amount: null }] } },
      ],
    });
    expect(await p.reseaux()).toEqual([
      { pays: 'GA', devise: 'XAF', code: 'airtel_ga', nom: 'Airtel Money', encaissement: true, otpRequis: false, montantMax: 2_000_000 },
      { pays: 'GA', devise: 'XAF', code: 'moov_ga', nom: 'Moov Money', encaissement: false, otpRequis: false, montantMax: null },
    ]);
    expect(appels[0]!.url).toBe('https://api.saspay.me/api/v1/pricing/my-rates/');
  });
});

describe('SasPay — notification webhook signée', () => {
  const corps = JSON.stringify({ event: 'transaction.success', data: { id: '7c1a', reference: 'TXN-2026-000456', status: 'SUCCESS', amount: '150000.00', currency: 'XAF' } });
  const horodatage = String(MAINTENANT / 1000);
  const signer = (h: string, c: string, s = SECRET) => createHmac('sha256', s).update(`${h}.${c}`).digest('hex');
  const entetes = (h = horodatage, c = corps, s = SECRET) => ({ 'x-webhook-signature': signer(h, c, s), 'x-webhook-timestamp': h, 'x-webhook-event': 'transaction.success' });

  it('accepte une signature valide sur le corps brut', () => {
    expect(sasPay({ corps: {} }).p.lireNotification(corps, entetes())).toEqual({ evenement: 'transaction.success', idTransaction: '7c1a' });
  });

  it('refuse un corps modifié, un mauvais secret ou une signature absente', () => {
    const { p } = sasPay({ corps: {} });
    expect(p.lireNotification(corps.replace('150000', '1'), entetes())).toBeNull();
    expect(p.lireNotification(corps, entetes(horodatage, corps, 'autre-secret'))).toBeNull();
    expect(p.lireNotification(corps, { 'x-webhook-timestamp': horodatage })).toBeNull();
  });

  it('refuse un horodatage de plus de 5 minutes (rejeu), dans les deux sens', () => {
    const { p } = sasPay({ corps: {} });
    expect(p.lireNotification(corps, entetes(String(MAINTENANT / 1000 - 301)))).toBeNull();
    expect(p.lireNotification(corps, entetes(String(MAINTENANT / 1000 + 301)))).toBeNull();
    expect(p.lireNotification(corps, entetes(String(MAINTENANT / 1000 - 299)))).not.toBeNull();
  });

  it('ne s’applique jamais directement à une commande (pas de référence de commande dans le webhook)', () => {
    expect(sasPay({ corps: {} }).p.verifierWebhook()).toBeNull();
  });
});
