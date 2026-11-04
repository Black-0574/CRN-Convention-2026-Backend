/**
 * Paiements : interface commune à tous les prestataires (Mobile Money via l'agrégateur local,
 * carte au Palier 2, bac à sable pour les tests) — aucun prestataire codé en dur (correction
 * obligatoire n° 8). Webhooks signés et vérifiés, traités une seule fois (idempotence), sûrs en cas
 * de rejeu ou d'arrivée dans le désordre.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type StatutCommande = 'en_attente' | 'payee' | 'echouee' | 'expiree' | 'remboursee' | 'a_verifier';
export type StatutPrestataire = 'payee' | 'echouee' | 'remboursee';

/** Événement normalisé, quel que soit le prestataire. */
export interface EvenementPaiement {
  idEvenement: string;
  referenceCommande: string;
  referenceExterne: string;
  statut: StatutPrestataire;
  montantXAF: number;
}

export interface DemandePaiement {
  referenceCommande: string;
  montantXAF: number;
  telephone?: string;
  email: string;
  description: string;
  urlRetour: string;
}

export interface PaymentProvider {
  readonly nom: string;
  /** Lance le paiement (ex. demande de validation sur le téléphone Mobile Money). */
  creerPaiement(demande: DemandePaiement): Promise<{ referenceExterne: string; redirection?: string }>;
  /** Vérifie la signature et normalise le corps reçu ; `null` si la signature est invalide. */
  verifierWebhook(corpsBrut: string, entetes: Readonly<Record<string, string | undefined>>): EvenementPaiement | null;
  /** Statut côté prestataire (réconciliation quotidienne, reprise après webhook perdu). */
  statut(referenceExterne: string): Promise<StatutPrestataire | 'en_attente'>;
  rembourser?(referenceExterne: string, montantXAF: number): Promise<void>;
}

export type Decision =
  | { action: 'appliquer'; statut: StatutCommande }
  | { action: 'ignorer'; raison: string }
  | { action: 'anomalie'; statut: 'a_verifier'; raison: string };

/**
 * Transition d'une commande à la réception d'un événement (déjà authentifié et non dupliqué).
 * - Un paiement confirmé l'emporte sur un échec arrivé après lui (désordre).
 * - Argent reçu alors que la réservation a été libérée (commande échouée ou expirée), ou montant
 *   différent du montant attendu : la commande passe « à vérifier » — jamais de survente
 *   silencieuse ; l'équipe honore ou rembourse depuis le back-office.
 */
export function deciderTransition(
  actuel: { statut: StatutCommande; montantXAF: number },
  evt: EvenementPaiement,
): Decision {
  switch (evt.statut) {
    case 'payee':
      if (actuel.statut === 'payee') return { action: 'ignorer', raison: 'déjà payée' };
      if (evt.montantXAF !== actuel.montantXAF) {
        return { action: 'anomalie', statut: 'a_verifier', raison: `montant reçu ${evt.montantXAF} ≠ attendu ${actuel.montantXAF}` };
      }
      if (actuel.statut === 'en_attente') return { action: 'appliquer', statut: 'payee' };
      return { action: 'anomalie', statut: 'a_verifier', raison: `paiement reçu sur une commande « ${actuel.statut} »` };
    case 'echouee':
      if (actuel.statut === 'en_attente') return { action: 'appliquer', statut: 'echouee' };
      return { action: 'ignorer', raison: `échec reçu sur une commande « ${actuel.statut} »` };
    case 'remboursee':
      if (actuel.statut === 'payee' || actuel.statut === 'a_verifier') return { action: 'appliquer', statut: 'remboursee' };
      return { action: 'ignorer', raison: `remboursement reçu sur une commande « ${actuel.statut} »` };
  }
}

/** Persistance minimale nécessaire au traitement (implémentée en base par l'API). */
export interface DepotPaiements {
  /** Enregistre l'événement ; `false` s'il l'était déjà (contrainte d'unicité fournisseur + id). */
  enregistrerEvenement(fournisseur: string, evt: EvenementPaiement): Promise<boolean>;
  commande(reference: string): Promise<{ statut: StatutCommande; montantXAF: number } | null>;
  appliquer(reference: string, decision: Exclude<Decision, { action: 'ignorer' }>): Promise<void>;
}

export type ResultatWebhook =
  | { code: 401; resultat: 'signature_invalide' }
  | { code: 200; resultat: 'doublon' | 'commande_inconnue' | 'ignore' | 'applique' | 'anomalie' };

/**
 * Traite un webhook de bout en bout. Toujours 200 une fois la signature vérifiée (même doublon ou
 * commande inconnue) pour que le prestataire cesse de relancer ; 401 sinon.
 */
export async function traiterWebhook(
  prestataire: PaymentProvider,
  depot: DepotPaiements,
  corpsBrut: string,
  entetes: Readonly<Record<string, string | undefined>>,
): Promise<ResultatWebhook> {
  const evt = prestataire.verifierWebhook(corpsBrut, entetes);
  if (!evt) return { code: 401, resultat: 'signature_invalide' };
  if (!(await depot.enregistrerEvenement(prestataire.nom, evt))) return { code: 200, resultat: 'doublon' };
  const commande = await depot.commande(evt.referenceCommande);
  if (!commande) return { code: 200, resultat: 'commande_inconnue' };
  const decision = deciderTransition(commande, evt);
  if (decision.action === 'ignorer') return { code: 200, resultat: 'ignore' };
  await depot.appliquer(evt.referenceCommande, decision);
  return { code: 200, resultat: decision.action === 'appliquer' ? 'applique' : 'anomalie' };
}

/**
 * Prestataire « bac à sable » : simule un agrégateur dont les webhooks sont signés en
 * HMAC-SHA256 (en-tête `x-crn-signature: sha256=<hex>`). Sert aux tests et à la préproduction
 * tant que les identifiants de l'agrégateur réel ne sont pas fournis.
 */
export class BacASable implements PaymentProvider {
  readonly nom = 'bac-a-sable';
  private readonly statuts = new Map<string, StatutPrestataire | 'en_attente'>();
  private compteur = 0;

  constructor(private readonly secretWebhook: string) {}

  async creerPaiement(demande: DemandePaiement) {
    const referenceExterne = `BAS-${demande.referenceCommande}-${++this.compteur}`;
    this.statuts.set(referenceExterne, 'en_attente');
    return { referenceExterne };
  }

  /** Corps et en-têtes d'un webhook tel que l'enverrait le prestataire (pour les tests). */
  webhook(evt: EvenementPaiement): { corps: string; entetes: Record<string, string> } {
    this.statuts.set(evt.referenceExterne, evt.statut);
    const corps = JSON.stringify(evt);
    return { corps, entetes: { 'x-crn-signature': `sha256=${this.signature(corps)}` } };
  }

  verifierWebhook(corpsBrut: string, entetes: Readonly<Record<string, string | undefined>>): EvenementPaiement | null {
    const recue = entetes['x-crn-signature']?.replace(/^sha256=/, '') ?? '';
    const attendue = this.signature(corpsBrut);
    if (!/^[0-9a-f]{64}$/.test(recue) || !timingSafeEqual(Buffer.from(recue, 'hex'), Buffer.from(attendue, 'hex'))) return null;
    try {
      return JSON.parse(corpsBrut) as EvenementPaiement;
    } catch {
      return null;
    }
  }

  async statut(referenceExterne: string) {
    return this.statuts.get(referenceExterne) ?? 'en_attente';
  }

  private signature(corps: string): string {
    return createHmac('sha256', this.secretWebhook).update(corps).digest('hex');
  }
}
