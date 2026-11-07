'use client';

/**
 * Habillage du menu latéral : emblème et nom du back-office en tête (admin.components.beforeNavLinks),
 * carte du compte connecté en pied — photo ou initiales, nom, rôle, lien vers « Mon compte »
 * (admin.components.afterNavLinks). Les rubriques elles-mêmes restent celles de Payload, filtrées
 * par rôle (src/lib/roles.ts) et habillées en CSS (crn-admin-theme.css).
 */
import { useAuth } from '@payloadcms/ui';
import React from 'react';

import { ROLES } from '../../boutique/lib/acces';
import { Pastille } from './Avatar';

export function MarqueMenu() {
  return (
    <a className="crn-menu-marque" href="/admin">
      <img src="/brand/icon.webp" alt="" width={36} height={36} />
      <span>
        <strong>Convention CRN 2026</strong>
        <span>Back-office</span>
      </span>
    </a>
  );
}

export function CompteMenu() {
  const { user } = useAuth();
  if (!user) return null;
  const u = user as { nomAffiche?: string | null; email?: string; role?: string };
  return (
    <a className="crn-menu-compte" href="/admin/account">
      <Pastille profil={user as never} taille={40} />
      <span>
        <strong>{u.nomAffiche || u.email}</strong>
        <span>{ROLES.find((r) => r.value === u.role)?.label ?? u.role}</span>
      </span>
    </a>
  );
}
