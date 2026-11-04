/**
 * Jeton porté par le QR code d'un billet (un par titulaire) : identifiant aléatoire de 128 bits +
 * signature HMAC-SHA256 tronquée, encodés en base64url — « <id>.<signature> ». Aucune donnée
 * personnelle dans le QR (prompt maître, « Billets et contrôle d'accès »).
 *
 * La base ne stocke que l'empreinte SHA-256 du jeton complet : une fuite de la base ne permet pas
 * de fabriquer de QR valides, et un QR forgé sans le secret est rejeté avant toute lecture.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const OCTETS_ID = 16; // 128 bits
const OCTETS_SIGNATURE = 16; // HMAC-SHA256 tronqué à 128 bits : QR plus petit, lisible en faible lumière
const FORME = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/;

function signer(id: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`crn-billet:v1:${id}`).digest().subarray(0, OCTETS_SIGNATURE);
}

function verifierSecret(secret: string): void {
  if (secret.length < 32) throw new Error('Secret de signature des billets trop court (32 caractères minimum).');
}

/** Nouveau jeton de billet. */
export function creerJeton(secret: string): string {
  verifierSecret(secret);
  const id = randomBytes(OCTETS_ID).toString('base64url');
  return `${id}.${signer(id, secret).toString('base64url')}`;
}

/** `true` si le jeton a la bonne forme et une signature valide (comparaison à temps constant). */
export function jetonAuthentique(jeton: string, secret: string): boolean {
  verifierSecret(secret);
  if (!FORME.test(jeton)) return false;
  const [id, signature] = jeton.split('.') as [string, string];
  const attendue = signer(id, secret);
  const recue = Buffer.from(signature, 'base64url');
  return recue.length === attendue.length && timingSafeEqual(recue, attendue);
}

/** Empreinte stockée en base pour retrouver le titulaire d'un jeton. */
export function empreinteJeton(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex');
}
