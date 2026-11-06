/**
 * Prestataire SasPay (https://docs.saspay.me), agrégateur Mobile Money et carte retenu par le CRN
 * le 6 novembre 2026. Paiement par **checkout hébergé** : le client choisit son pays, son réseau
 * ou la carte sur la page SasPay, puis revient au suivi de sa commande.
 *
 * - Création : `POST /checkout-sessions/` (montant en chaîne décimale, XAF) ; la session expire
 *   avec la réservation des places, la référence externe est l'identifiant de la session.
 * - Statut : `GET /checkout-sessions/{id}/status/`, que SasPay revérifie toujours auprès de
 *   l'opérateur. Session payée → **payée seulement si** `GET /payments/{id}/verify/` renvoie
 *   `SUCCESS` (règle SasPay « vérifier avant de livrer ») ; `EXPIRED` / `CANCELLED` → échouée ;
 *   sinon en attente (un essai raté laisse la session ouverte : le client peut réessayer).
 * - Comptabilité : montant débité au client (`debited_amount`) et net reçu (`net_amount`) relevés
 *   à la vérification, jamais `amount` seul.
 * - Webhooks : signature HMAC-SHA256 hexadécimale de « horodatage.corps brut »
 *   (`X-Webhook-Signature`, `X-Webhook-Timestamp`), horodatage à 5 minutes au plus. Le corps
 *   décrit la transaction sans référence à notre commande : il sert de **notification signée**,
 *   le statut est ensuite relu par l'API (aucune livraison sur la seule foi d'un webhook).
 * Clé API et secret de webhook : côté serveur uniquement (variables d'environnement).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { DemandePaiement, EvenementPaiement, PaymentProvider, StatutPrestataire } from './paiements.ts';

export interface ConfigSasPay {
  /** Clé secrète `sk_test_…` ou `sk_live_…`. */
  cleApi: string;
  /** Secret de signature du point de réception, affiché une seule fois dans le tableau de bord. */
  secretWebhook: string;
  urlApi?: string;
  /** Pays présélectionné sur la page de paiement (ISO 2), modifiable par le client. */
  pays?: string;
  /** Qui paie les frais : `DEDUCTED` (prix affiché = prix débité) ou `ADD_ON`. Défaut : réglage du compte SasPay. */
  modeFrais?: 'ADD_ON' | 'DEDUCTED';
  fetch?: typeof fetch;
  /** Horloge (millisecondes), pour les tests. */
  maintenant?: () => number;
}

/** Notification signée reçue de SasPay. */
export interface NotificationSasPay {
  evenement: string;
  idTransaction: string | null;
}

/** Ce que la vérification d'un paiement réussi apprend, pour la commande et la comptabilité. */
export interface InformationsPaiement {
  idTransaction: string;
  debiteXAF: number | null;
  netXAF: number | null;
  detail: string;
}

/** Réseau ouvert au compte (`GET /pricing/my-rates/`), pour le contrôle de configuration. */
export interface ReseauSasPay {
  pays: string;
  devise: string;
  code: string;
  nom: string;
  encaissement: boolean;
  otpRequis: boolean;
  /** Plafond par paiement (plus haut palier tarifaire), si SasPay en publie un. */
  montantMax: number | null;
}

export const TOLERANCE_WEBHOOK_SECONDES = 300;

const entier = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
};
const fcfa = (n: number) => `${n.toLocaleString('fr-FR').replace(/\s/g, ' ')} F CFA`;

export class ErreurSasPay extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly codeSasPay?: string,
  ) {
    super(message);
  }
}

export class SasPay implements PaymentProvider {
  readonly nom = 'saspay';
  private readonly urlApi: string;
  private readonly appeler: typeof fetch;
  private readonly maintenant: () => number;
  private readonly informationsConnues = new Map<string, InformationsPaiement>();

  constructor(private readonly config: ConfigSasPay) {
    if (!/^sk_(test|live)_/.test(config.cleApi)) throw new Error('Clé API SasPay absente ou invalide (sk_test_… ou sk_live_…).');
    if (!config.secretWebhook) throw new Error('Secret de webhook SasPay absent.');
    this.urlApi = (config.urlApi ?? 'https://api.saspay.me/api/v1').replace(/\/$/, '');
    this.appeler = config.fetch ?? fetch;
    this.maintenant = config.maintenant ?? Date.now;
  }

  get modeTest(): boolean {
    return this.config.cleApi.startsWith('sk_test_');
  }

  async creerPaiement(demande: DemandePaiement) {
    const session = await this.requete<{ id: string; checkout_url?: string }>('POST', '/checkout-sessions/', {
      amount: `${demande.montantXAF}.00`,
      currency: 'XAF',
      description: demande.description,
      customer_email: demande.email,
      customer_name: demande.nom || demande.email,
      ...(demande.telephone ? { customer_phone: demande.telephone } : {}),
      return_url: demande.urlRetour,
      metadata: { reference_commande: demande.referenceCommande },
      ...(this.config.pays ? { country: this.config.pays } : {}),
      ...(this.config.modeFrais ? { fee_charge_mode: this.config.modeFrais } : {}),
      ...(demande.expireA ? { expires_at: demande.expireA } : {}),
    });
    if (!session.id || !session.checkout_url) throw new ErreurSasPay('Réponse SasPay incomplète (session sans adresse de paiement).', 502);
    return { referenceExterne: session.id, redirection: session.checkout_url };
  }

  /**
   * Les webhooks SasPay ne portent pas la référence de la commande : ils ne s'appliquent jamais
   * directement (voir `lireNotification`, puis relecture du statut par l'API).
   */
  verifierWebhook(): EvenementPaiement | null {
    return null;
  }

  /** Vérifie horodatage et signature sur le corps brut ; `null` si l'un ou l'autre est invalide. */
  lireNotification(corpsBrut: string, entetes: Readonly<Record<string, string | undefined>>): NotificationSasPay | null {
    const signature = (entetes['x-webhook-signature'] ?? '').toLowerCase();
    const horodatage = entetes['x-webhook-timestamp'] ?? '';
    if (!/^[0-9a-f]{64}$/.test(signature) || !/^\d+$/.test(horodatage)) return null;
    if (Math.abs(this.maintenant() / 1000 - Number(horodatage)) > TOLERANCE_WEBHOOK_SECONDES) return null;
    const attendue = createHmac('sha256', this.config.secretWebhook).update(`${horodatage}.${corpsBrut}`).digest('hex');
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(attendue, 'hex'))) return null;
    try {
      const corps = JSON.parse(corpsBrut) as { event?: unknown; data?: { id?: unknown } };
      return {
        evenement: typeof corps.event === 'string' ? corps.event : (entetes['x-webhook-event'] ?? ''),
        idTransaction: typeof corps.data?.id === 'string' ? corps.data.id : null,
      };
    } catch {
      return null;
    }
  }

  async statut(referenceExterne: string): Promise<StatutPrestataire | 'en_attente'> {
    const s = await this.requete<{ status?: string; transaction_id?: string | null; transaction_status?: string | null }>(
      'GET',
      `/checkout-sessions/${encodeURIComponent(referenceExterne)}/status/`,
    );
    if (s.status === 'PAID' || s.transaction_status === 'SUCCESS') {
      // Livraison seulement si la transaction elle-même est vérifiée SUCCESS.
      if (!s.transaction_id) return 'en_attente';
      const t = await this.requete<{ status?: string; debited_amount?: string; net_amount?: string; client_fee?: string }>(
        'GET',
        `/payments/${encodeURIComponent(s.transaction_id)}/verify/`,
      );
      if (t.status !== 'SUCCESS') return 'en_attente';
      const debite = entier(t.debited_amount);
      const net = entier(t.net_amount);
      const frais = entier(t.client_fee);
      this.informationsConnues.set(referenceExterne, {
        idTransaction: s.transaction_id,
        debiteXAF: debite,
        netXAF: net,
        detail: [`SasPay ${s.transaction_id}`, debite !== null && `débité ${fcfa(debite)}`, net !== null && `net reçu ${fcfa(net)}`, frais ? `frais client ${fcfa(frais)}` : null]
          .filter(Boolean)
          .join(' · '),
      });
      return 'payee';
    }
    if (s.status === 'EXPIRED' || s.status === 'CANCELLED') return 'echouee';
    return 'en_attente';
  }

  /** Informations du dernier paiement vérifié pour cette session (après `statut` → payée). */
  informations(referenceExterne: string): InformationsPaiement | undefined {
    return this.informationsConnues.get(referenceExterne);
  }

  /** Réseaux ouverts au compte, pour le contrôle de configuration (`npm run saspay:verifier`). */
  async reseaux(): Promise<ReseauSasPay[]> {
    type Palier = { max_amount?: string | null };
    type Ligne = {
      country_code: string;
      currency: string;
      network_code: string;
      network_name: string;
      payin?: { available?: boolean; otp_required?: boolean; tiers?: Palier[] };
    };
    const r = await this.requete<Ligne[] | { results?: Ligne[] }>('GET', '/pricing/my-rates/');
    const lignes = Array.isArray(r) ? r : (r.results ?? []);
    return lignes.map((l) => {
      const plafonds = (l.payin?.tiers ?? []).map((p) => (p.max_amount === null || p.max_amount === undefined ? Infinity : Number(p.max_amount)));
      const max = plafonds.length ? Math.max(...plafonds) : Infinity;
      return {
        pays: l.country_code,
        devise: l.currency,
        code: l.network_code,
        nom: l.network_name,
        encaissement: Boolean(l.payin?.available),
        otpRequis: Boolean(l.payin?.otp_required),
        montantMax: Number.isFinite(max) ? max : null,
      };
    });
  }

  /**
   * Points de réception webhook du compte et leurs abonnements (lecture seule : création et
   * modification se font uniquement dans le tableau de bord SasPay).
   */
  async webhooks(): Promise<{ url: string; environnement: string; actif: boolean; evenements: string[] }[]> {
    type Liste<T> = T[] | { results?: T[] };
    const liste = <T>(r: Liste<T>) => (Array.isArray(r) ? r : (r.results ?? []));
    const points = liste(await this.requete<Liste<{ id: string; url: string; environment?: string; is_active?: boolean }>>('GET', '/merchant-webhooks/'));
    const abonnements = liste(await this.requete<Liste<{ webhook: string; event_type: string }>>('GET', '/merchant-webhook-subscriptions/'));
    return points.map((w) => ({
      url: w.url,
      environnement: w.environment ?? '',
      actif: w.is_active !== false,
      evenements: abonnements.filter((a) => a.webhook === w.id).map((a) => a.event_type),
    }));
  }

  /** Appel authentifié ; accepte la réponse dans l'enveloppe `{ success, data }` ou nue. */
  private async requete<T>(methode: 'GET' | 'POST', chemin: string, corps?: unknown): Promise<T> {
    let reponse: Response;
    try {
      reponse = await this.appeler(`${this.urlApi}${chemin}`, {
        method: methode,
        headers: { Authorization: `Bearer ${this.config.cleApi}`, Accept: 'application/json', ...(corps ? { 'Content-Type': 'application/json' } : {}) },
        ...(corps ? { body: JSON.stringify(corps) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new ErreurSasPay(`SasPay injoignable (${(e as Error).message}).`, 502);
    }
    const texte = await reponse.text();
    let json: { success?: boolean; data?: T; error?: { message?: string; code?: string } | Record<string, string[]>; message?: string; code?: string } = {};
    try {
      json = texte ? JSON.parse(texte) : {};
    } catch {
      /* corps non JSON : traité comme une erreur ci-dessous */
    }
    if (!reponse.ok || json.success === false) {
      const e = json.error as { message?: string; code?: string } | undefined;
      const message = e?.message ?? json.message ?? (e ? JSON.stringify(e) : `HTTP ${reponse.status}`);
      throw new ErreurSasPay(`SasPay : ${message}`, reponse.status, e?.code ?? json.code);
    }
    return (json.data ?? json) as T;
  }
}
