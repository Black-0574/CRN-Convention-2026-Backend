/**
 * Test de bout en bout du paiement SasPay dans le back-office, sans SasPay : un faux serveur SasPay
 * (mêmes routes et réponses que la documentation docs.saspay.me) tourne dans ce script, et les
 * vrais endpoints de la boutique sont appelés (création du paiement, webhook).
 *
 * Vérifie : session créée en XAF et liée à la commande ; webhook mal signé refusé ; webhook valide
 * sur une session encore ouverte sans effet ; session payée dont la transaction n'est pas vérifiée
 * SUCCESS sans effet ; transaction vérifiée SUCCESS → commande payée, billet émis, place vendue,
 * montants débité et net enregistrés ; rejeu sans effet ; session expirée → commande échouée et place
 * rendue ; paiement confirmé sur une commande déjà expirée → « à vérifier ». Données de test
 * supprimées à la fin.
 *
 *   npm run test:saspay
 */
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPayload, type PayloadRequest } from 'payload';

// Faux SasPay : sessions en mémoire, statut piloté par le test ; une session payée porte une
// transaction, dont la vérification (`verify`) peut être forcée à un autre statut que SUCCESS.
const sessions = new Map<string, { status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'; amount: string; currency: string; verification?: 'SUCCESS' | 'FAILED' | 'PENDING' }>();
let compteur = 0;
const serveur = createServer((req, res) => {
  let corps = '';
  req.on('data', (d) => (corps += d));
  req.on('end', () => {
    const repondre = (code: number, donnees: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: code < 400, ...(code < 400 ? { data: donnees } : { error: donnees }), code }));
    };
    if (req.headers.authorization !== `Bearer ${process.env.SASPAY_API_KEY}`) return repondre(401, { message: 'Clé invalide', code: 'invalid_api_key' });
    if (req.method === 'POST' && req.url === '/api/v1/checkout-sessions/') {
      const b = JSON.parse(corps) as { amount: string; currency: string };
      const id = `session-${++compteur}`;
      sessions.set(id, { status: 'PENDING', amount: b.amount, currency: b.currency });
      return repondre(201, { id, checkout_url: `https://pay.saspay.me/checkout/${id}`, status: 'PENDING', ...b });
    }
    const m = req.url?.match(/^\/api\/v1\/checkout-sessions\/([^/]+)\/status\/$/);
    if (req.method === 'GET' && m) {
      const s = sessions.get(decodeURIComponent(m[1]!));
      if (!s) return repondre(404, { message: 'Session introuvable', code: 'not_found' });
      const paye = s.status === 'PAID';
      return repondre(200, { id: m[1], status: s.status, transaction_id: paye ? `txn-${m[1]}` : null, transaction_status: paye ? 'SUCCESS' : null });
    }
    const v = req.url?.match(/^\/api\/v1\/payments\/txn-([^/]+)\/verify\/$/);
    if (req.method === 'GET' && v) {
      const s = sessions.get(decodeURIComponent(v[1]!));
      if (!s) return repondre(404, { message: 'Transaction introuvable.', code: 'not_found' });
      const montant = Number(s.amount);
      return repondre(200, { id: `txn-${v[1]}`, status: s.verification ?? 'SUCCESS', requested_amount: s.amount, debited_amount: (montant + 25).toFixed(2), net_amount: s.amount, client_fee: '25.00', currency: s.currency });
    }
    repondre(404, { message: 'Route inconnue', code: 'not_found' });
  });
});
await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r));

process.env.PAIEMENT_PRESTATAIRE = 'saspay';
process.env.SASPAY_API_KEY = 'sk_test_essai_local';
process.env.SASPAY_WEBHOOK_SECRET = 'secret-webhook-essai';
process.env.SASPAY_API_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/v1`;
process.env.TACHES_DESACTIVEES = '1';
process.env.BILLETS_SECRET ||= 'secret-billets-essai-local-32-caracteres-min';
process.env.LIENS_SECRET ||= 'secret-liens-essai-local-32-caracteres-minimum';

const { default: config } = await import('../payload.config');
const { endpoints } = await import('../src/boutique/endpoints');
const { creerCommande, liberer } = await import('../src/boutique/lib/ventes');
const { lignes, sql } = await import('../src/boutique/lib/db');
const { reconciliationsTerminees } = await import('../src/boutique/lib/taches');

const payload = await getPayload({ config });
const suffixe = Date.now();
const marqueur = `saspay-${suffixe}.invalid`;
const verifs: [string, boolean][] = [];
const verifier = (libelle: string, ok: boolean) => {
  verifs.push([libelle, ok]);
  console.log(`${ok ? '✓' : '✗'} ${libelle}`);
};

// Produit de test : un ticket à 1 000 F CFA, 5 places.
const quota = await payload.create({ collection: 'quotas', data: { nom: `Test SasPay ${suffixe}`, capacite: 5 } });
const plateforme = await payload.create({ collection: 'plateformes', data: { code: `test-saspay-${suffixe}`, nom: 'Test SasPay', publique: false } });
const produit = await payload.create({
  collection: 'produits',
  data: { nom: `Test SasPay ${suffixe}`, slug: `test-saspay-${suffixe}`, type: 'ticket', paliers: [{ prixXAF: 1000, du: '2026-01-01' }], plateformes: [plateforme.id], quotas: [quota.id], actif: true, prixAValider: false },
});
const variante = await payload.create({ collection: 'variantes', data: { produit: produit.id, libelle: 'Unique', sku: `test-saspay-${suffixe}` } });
const placesQuota = async () => (await lignes<{ vendus: string; reserves: string }>(payload, sql`SELECT vendus, reserves FROM quotas WHERE id = ${quota.id}`))[0]!;

const route = (chemin: string, methode: string) => endpoints.find((e) => e.path === chemin && e.method === methode)!.handler;
const appeler = async (chemin: string, methode: string, routeParams: Record<string, string>, options: { t?: string; corps?: string; entetes?: Record<string, string> } = {}) => {
  const req = {
    payload,
    routeParams,
    searchParams: new URLSearchParams(options.t ? { t: options.t } : {}),
    headers: new Headers(options.entetes ?? {}),
    text: async () => options.corps ?? '',
    json: async () => JSON.parse(options.corps || '{}'),
  } as unknown as PayloadRequest;
  const r = (await route(chemin, methode)(req)) as Response;
  return { code: r.status, corps: (await r.json()) as Record<string, unknown> };
};

async function nouvelleCommandePayable(i: number) {
  const personne = { prenom: 'Test', nom: `SasPay ${i}`, email: `test${i}@${marqueur}`, telephone: '+241 60 00 00 00' };
  const c = await creerCommande(payload, { client: personne, lignes: [{ varianteId: variante.id, quantite: 1 }], titulaires: [{ ligne: 0, ...personne }], cgvAcceptees: true });
  const r = await appeler('/boutique/commandes/:numero/paiement', 'post', { numero: c.numero }, { t: c.jetonSuivi });
  const doc = (await payload.find({ collection: 'commandes', where: { numero: { equals: c.numero } }, limit: 1, depth: 0 })).docs[0]!;
  return { c, r, session: doc.paiement?.referenceExterne ?? '' };
}
const statutCommande = async (numero: string) => (await payload.find({ collection: 'commandes', where: { numero: { equals: numero } }, limit: 1, depth: 0 })).docs[0]!.statut;

// Le webhook répond aussitôt et traite en arrière-plan : on attend la fin du traitement.
const webhook = async (secret = process.env.SASPAY_WEBHOOK_SECRET!) => {
  const corps = JSON.stringify({ event: 'transaction.success', data: { id: `txn-${suffixe}`, status: 'SUCCESS', amount: '1000.00', currency: 'XAF' } });
  const horodatage = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${horodatage}.${corps}`).digest('hex');
  const r = await appeler('/boutique/paiements/:prestataire/webhook', 'post', { prestataire: 'saspay' }, { corps, entetes: { 'x-webhook-signature': signature, 'x-webhook-timestamp': horodatage, 'x-webhook-event': 'transaction.success' } });
  await reconciliationsTerminees();
  return r;
};
const commande = async (numero: string) => (await payload.find({ collection: 'commandes', where: { numero: { equals: numero } }, limit: 1, depth: 0 })).docs[0]!;

try {
  // 1. Création du paiement.
  const a = await nouvelleCommandePayable(1);
  const s = sessions.get(a.session);
  verifier('session SasPay créée en XAF au montant de la commande, redirection vers la page SasPay', a.r.code === 200 && s?.currency === 'XAF' && s.amount === '1000.00' && String(a.r.corps.redirection).startsWith('https://pay.saspay.me/checkout/'));

  // 2. Webhook mal signé.
  verifier('webhook mal signé refusé (401), commande inchangée', (await webhook('mauvais-secret')).code === 401 && (await statutCommande(a.c.numero)) === 'en_attente');

  // 3. Webhook valide, session pas encore payée.
  await webhook();
  verifier('webhook valide, session encore ouverte : commande toujours en attente', (await statutCommande(a.c.numero)) === 'en_attente');

  // 4. Session marquée payée mais transaction pas vérifiée SUCCESS : rien n'est livré.
  sessions.get(a.session)!.status = 'PAID';
  sessions.get(a.session)!.verification = 'PENDING';
  await webhook();
  verifier('session payée mais transaction non vérifiée SUCCESS : commande toujours en attente', (await statutCommande(a.c.numero)) === 'en_attente');

  // 5. Transaction vérifiée SUCCESS.
  sessions.get(a.session)!.verification = 'SUCCESS';
  const w = await webhook();
  const titulaires = await payload.find({ collection: 'titulaires', where: { commande: { equals: a.c.id } }, depth: 0 });
  const q = await placesQuota();
  verifier('transaction vérifiée SUCCESS + webhook : commande payée, billet émis, place vendue', w.code === 200 && (await statutCommande(a.c.numero)) === 'payee' && titulaires.docs.every((t) => Boolean(t.numeroBillet)) && titulaires.totalDocs === 1 && Number(q.vendus) === 1);
  const detail = (await commande(a.c.numero)).paiement?.detail ?? '';
  verifier(`montants débité et net reçu enregistrés sur la commande (« ${detail} »)`, /débité 1\D?025/.test(detail) && /net reçu 1\D?000/.test(detail));

  // 6. Rejeu.
  const rejeu = await webhook();
  verifier('rejeu du webhook sans effet (idempotent)', rejeu.code === 200 && (await statutCommande(a.c.numero)) === 'payee' && Number((await placesQuota()).vendus) === 1);

  // 7. Session expirée.
  const b = await nouvelleCommandePayable(2);
  sessions.get(b.session)!.status = 'EXPIRED';
  await webhook();
  verifier('session expirée : commande échouée, place rendue', (await statutCommande(b.c.numero)) === 'echouee' && Number((await placesQuota()).reserves) === 0);

  // 8. Paiement confirmé après l'expiration de la réservation.
  const c = await nouvelleCommandePayable(3);
  await lignes(payload, sql`UPDATE commandes SET reservation_expire_a = ${new Date(Date.now() - 60_000).toISOString()} WHERE id = ${c.c.id}`);
  sessions.get(c.session)!.status = 'PAID';
  await webhook();
  verifier('paiement reçu sur une commande expirée : « à vérifier », jamais perdu', (await statutCommande(c.c.numero)) === 'a_verifier');
} finally {
  // Nettoyage des données de test.
  const commandes = await payload.find({ collection: 'commandes', where: { email: { like: `@${marqueur}` } }, limit: 100, depth: 0 });
  for (const c of commandes.docs) {
    if (c.statut === 'en_attente') await liberer(payload, c.id);
    const t = await payload.find({ collection: 'titulaires', where: { commande: { equals: c.id } }, limit: 100, depth: 0 });
    for (const x of t.docs) await payload.delete({ collection: 'droits-acces', where: { titulaire: { equals: x.id } } });
    await payload.delete({ collection: 'titulaires', where: { commande: { equals: c.id } } });
    await payload.delete({ collection: 'reservations', where: { commande: { equals: c.id } } });
    await payload.delete({ collection: 'evenements-webhook', where: { referenceCommande: { equals: c.numero } } });
    await payload.delete({ collection: 'commandes', id: c.id });
  }
  await payload.delete({ collection: 'variantes', id: variante.id });
  await payload.delete({ collection: 'produits', id: produit.id });
  await payload.delete({ collection: 'plateformes', id: plateforme.id });
  await payload.delete({ collection: 'quotas', id: quota.id });
  serveur.close();
}

const ok = verifs.every(([, v]) => v);
console.log(ok ? '\nRÉUSSI : paiement SasPay de bout en bout.' : '\nÉCHEC.');
process.exit(ok ? 0 : 1);
