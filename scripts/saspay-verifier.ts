/**
 * Contrôle de la configuration SasPay avant d'ouvrir les ventes (à lancer là où tournent les
 * variables : en local avec le .env, ou avec les valeurs de production). N'affiche jamais la clé
 * ni les secrets. Lecture seule : aucun paiement, aucune session créée.
 *
 * Vérifie : variables présentes et bien formées ; SasPay joignable ; clé acceptée ; réseaux ouverts
 * au Gabon (encaissement, OTP, plafond par paiement comparé au prix le plus élevé du catalogue) ;
 * point de réception webhook déclaré vers notre adresse et abonné aux bons événements ; secrets
 * des billets et adresse publique du back-office.
 *
 *   npm run saspay:verifier
 */
import { getPayload } from 'payload';

import config from '../payload.config';
import { SasPay, type ReseauSasPay } from '../src/boutique/domaine/src/index.ts';
import { catalogue } from '../src/boutique/lib/catalogue';
import { urlBackOffice } from '../src/boutique/lib/urls';

const resultats: [string, 'ok' | 'attention' | 'bloquant', string?][] = [];
const noter = (libelle: string, etat: 'ok' | 'attention' | 'bloquant', detail?: string) => {
  resultats.push([libelle, etat, detail]);
  console.log(`${{ ok: '✓', attention: '!', bloquant: '✗' }[etat]} ${libelle}${detail ? ` — ${detail}` : ''}`);
};
const EVENEMENTS = ['transaction.success', 'transaction.failed', 'transaction.cancelled'];
const URL_WEBHOOK = `${urlBackOffice()}/api/boutique/paiements/saspay/webhook`;

// 1. Variables.
const cle = process.env.SASPAY_API_KEY ?? '';
const secret = process.env.SASPAY_WEBHOOK_SECRET ?? '';
noter('PAIEMENT_PRESTATAIRE=saspay', process.env.PAIEMENT_PRESTATAIRE === 'saspay' ? 'ok' : 'bloquant', `valeur actuelle : « ${process.env.PAIEMENT_PRESTATAIRE ?? ''} »`);
const formeCle = /^sk_(test|live)_/.test(cle);
noter('SASPAY_API_KEY', formeCle ? 'ok' : 'bloquant', formeCle ? (cle.startsWith('sk_live_') ? 'clé de production (sk_live_…)' : 'clé de test (sk_test_…)') : 'absente ou mal formée');
noter('SASPAY_WEBHOOK_SECRET', secret ? 'ok' : 'bloquant', secret ? 'renseigné' : 'absent (affiché une seule fois à la création du webhook)');
for (const nom of ['BILLETS_SECRET', 'LIENS_SECRET']) {
  noter(nom, (process.env[nom] ?? '').length >= 32 ? 'ok' : 'bloquant', (process.env[nom] ?? '').length >= 32 ? 'renseigné' : '32 caractères au moins');
}
const publique = urlBackOffice();
noter('PUBLIC_SERVER_URL', publique.startsWith('https://') ? 'ok' : 'attention', publique);
const frais = process.env.SASPAY_MODE_FRAIS ?? '';
noter('SASPAY_MODE_FRAIS', frais === 'DEDUCTED' ? 'ok' : 'attention', frais ? `${frais}${frais === 'ADD_ON' ? ' : le client paie plus que le prix affiché' : ''}` : 'vide : réglage du compte SasPay');

// 2. SasPay.
if (formeCle && secret) {
  const p = new SasPay({ cleApi: cle, secretWebhook: secret, ...(process.env.SASPAY_API_URL ? { urlApi: process.env.SASPAY_API_URL } : {}) });
  let reseaux: ReseauSasPay[] = [];
  try {
    reseaux = await p.reseaux();
    noter('Clé acceptée par SasPay', 'ok', `${reseaux.length} réseau(x) au total`);
  } catch (e) {
    noter('Clé acceptée par SasPay', 'bloquant', (e as Error).message);
  }

  const pays = process.env.SASPAY_PAYS || 'GA';
  const ouverts = reseaux.filter((r) => r.pays === pays && r.encaissement);
  noter(`Réseaux ouverts à l'encaissement (${pays})`, ouverts.length ? 'ok' : 'bloquant', ouverts.map((r) => `${r.nom}${r.otpRequis ? ' (OTP requis)' : ''}`).join(', ') || 'aucun');

  const payload = await getPayload({ config });
  const prixMax = Math.max(0, ...(await catalogue(payload)).map((v) => v.prixXAF ?? 0));
  for (const r of ouverts) {
    if (r.montantMax !== null && r.montantMax < prixMax) {
      noter(`Plafond ${r.nom}`, 'attention', `${r.montantMax} F CFA par paiement < prix le plus élevé du catalogue (${prixMax} F CFA)`);
    }
  }

  try {
    const w = (await p.webhooks()).find((x) => x.url.replace(/\/$/, '') === URL_WEBHOOK);
    if (!w) noter('Webhook déclaré', 'bloquant', `aucun point de réception vers ${URL_WEBHOOK} (tableau de bord SasPay → Webhooks)`);
    else {
      const manquants = EVENEMENTS.filter((e) => !w.evenements.includes(e));
      noter('Webhook déclaré', w.actif ? 'ok' : 'bloquant', `${w.environnement || 'environnement ?'}${w.actif ? '' : ', inactif'}`);
      noter('Abonnements du webhook', manquants.length ? 'bloquant' : 'ok', manquants.length ? `manquent : ${manquants.join(', ')}` : EVENEMENTS.join(', '));
    }
  } catch (e) {
    noter('Webhook déclaré', 'attention', `lecture impossible (${(e as Error).message})`);
  }
}

const bloquants = resultats.filter(([, e]) => e === 'bloquant').length;
console.log(
  bloquants
    ? `\n${bloquants} point(s) bloquant(s) : ne pas ouvrir les ventes.`
    : '\nConfiguration prête. Étapes suivantes : « webhook.test » depuis le tableau de bord SasPay, paiement de test (sk_test_), puis petit paiement réel avec sk_live_ avant d’ouvrir les ventes.',
);
process.exit(bloquants ? 1 : 0);
