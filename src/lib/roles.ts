/**
 * Rubriques du back-office par rôle (décision du Commanditaire, 7 novembre 2026 : chaque profil ne
 * voit et ne modifie que ses rubriques ; l'administrateur voit tout). Une seule table sert :
 * - au menu : une rubrique non permise est masquée (`admin.hidden`) ;
 * - aux droits du contenu du site, jusqu'ici ouvert à tout compte connecté (création,
 *   modification, suppression réservées aux rôles listés ; la lecture publique dont le site a
 *   besoin est inchangée). Les collections de la boutique gardent leurs règles d'accès propres
 *   (backend/src/boutique/collections), déjà par rôle et alignées sur cette table.
 */
import type { CollectionConfig, GlobalConfig } from 'payload';

import { reserveA, type Role } from '../boutique/lib/acces';

type Utilisateur = { role?: Role } | null | undefined;

/** Rôles (hors administrateur, qui a tout) ayant la rubrique dans leur menu. */
export const RUBRIQUES: Record<string, Role[]> = {
  // Site de la Convention
  speakers: ['editeur'],
  artists: ['editeur'],
  venues: ['editeur'],
  announcements: ['editeur'],
  'program-days': ['editeur'],
  faq: ['editeur'],
  products: ['editeur'],
  settings: ['editeur'],
  media: ['editeur', 'catalogue'],
  // Boutique — catalogue
  produits: ['catalogue'],
  variantes: ['catalogue'],
  categories: ['catalogue'],
  plateformes: ['catalogue', 'com_boutique'],
  quotas: ['catalogue', 'comptabilite', 'com_boutique'],
  // Boutique — ventes
  commandes: ['comptabilite', 'com_boutique'],
  titulaires: ['comptabilite', 'com_boutique'],
  'evenements-webhook': ['comptabilite'],
  consentements: ['comptabilite'],
  // Boutique — logistique et contrôle d'accès
  retraits: ['com_boutique'],
  'points-livraison': ['catalogue', 'com_boutique'],
  'droits-acces': ['com_boutique'],
  scans: ['com_boutique'],
  // Administration
  'reglages-boutique': [],
  'journal-actions': [],
};

/*
  Comptes (users) et photos de profil ne sont jamais masqués : Payload retire aussi les pages d'une
  collection masquée, dont « Mon compte » et l'envoi de sa photo. Leur accès se règle dans
  src/collections/Users.ts et PhotosProfil.ts (chacun ne lit que sa propre fiche).
*/

/** Collections du site dont l'écriture était ouverte à tout compte connecté. */
const CONTENU_DU_SITE = new Set(['speakers', 'artists', 'venues', 'announcements', 'program-days', 'faq', 'products', 'settings', 'media']);

export const GROUPE_SITE = 'Site de la Convention';

export const peutVoir = (user: Utilisateur, slug: string): boolean =>
  user?.role === 'admin' || (user?.role !== undefined && (RUBRIQUES[slug] ?? []).includes(user.role));

const masquer = (slug: string, dejaMasque: unknown) => (args: { user: unknown }) =>
  dejaMasque === true || !peutVoir(args.user as Utilisateur, slug);

/** Menu par rôle ; pour le contenu du site, écriture réservée aux rôles de la rubrique. */
export function avecRoles(c: CollectionConfig): CollectionConfig {
  if (!(c.slug in RUBRIQUES)) return c;
  const roles = RUBRIQUES[c.slug]!;
  const ecriture = CONTENU_DU_SITE.has(c.slug) ? { create: reserveA(...roles), update: reserveA(...roles), delete: reserveA(...roles) } : {};
  return {
    ...c,
    access: { ...ecriture, ...c.access },
    admin: {
      ...c.admin,
      ...(CONTENU_DU_SITE.has(c.slug) && !c.admin?.group ? { group: GROUPE_SITE } : {}),
      hidden: masquer(c.slug, c.admin?.hidden),
    },
  };
}

export function avecRolesGlobal(g: GlobalConfig): GlobalConfig {
  if (!(g.slug in RUBRIQUES)) return g;
  const roles = RUBRIQUES[g.slug]!;
  const ecriture = CONTENU_DU_SITE.has(g.slug) ? { update: reserveA(...roles) } : {};
  return {
    ...g,
    access: { ...ecriture, ...g.access },
    admin: {
      ...g.admin,
      ...(CONTENU_DU_SITE.has(g.slug) && !g.admin?.group ? { group: GROUPE_SITE } : {}),
      hidden: masquer(g.slug, g.admin?.hidden),
    },
  };
}
