/**
 * Rôles nominatifs du back-office (contenu du site + boutique). Chaque compte est personnel et
 * porte un seul rôle ; l'administrateur a toujours accès à tout. La double authentification est
 * assurée devant /admin (Cloudflare Access, puis TOTP natif).
 */
import type { Access, PayloadRequest } from 'payload';

export const ROLES = [
  { label: 'Administrateur', value: 'admin' },
  { label: 'Éditeur (contenu du site)', value: 'editeur' },
  { label: 'Gestionnaire de catalogue (boutique)', value: 'catalogue' },
  { label: 'COM Boutique (retraits et contrôle d’accès)', value: 'com_boutique' },
  { label: 'Comptabilité (boutique)', value: 'comptabilite' },
] as const;

export type Role = (typeof ROLES)[number]['value'];

export const roleDe = (req: Pick<PayloadRequest, 'user'>): Role | undefined =>
  (req.user as { role?: Role } | null | undefined)?.role;

/** Accès réservé à certains rôles (l'administrateur a toujours accès). */
export const reserveA =
  (...roles: Role[]): Access =>
  ({ req }) => {
    const role = roleDe(req);
    return role === 'admin' || (role !== undefined && roles.includes(role));
  };

export const connecte: Access = ({ req }) => Boolean(req.user);
export const personne: Access = () => false;
export const tout: Access = () => true;
