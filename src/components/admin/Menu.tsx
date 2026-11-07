'use client';

/**
 * Habillage du menu latéral : emblème et nom du back-office, barre de recherche et lien « Tableau
 * de bord » en tête (admin.components.beforeNavLinks, demande du 7 novembre 2026) ; carte du compte
 * connecté en pied — photo ou initiales, nom, rôle, lien vers « Mon compte »
 * (admin.components.afterNavLinks). Les rubriques elles-mêmes restent celles de Payload, filtrées
 * par rôle (src/lib/roles.ts) et habillées en CSS (crn-admin-theme.css).
 */
import { useAuth } from '@payloadcms/ui';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { ROLES } from '../../boutique/lib/acces';
import { Pastille } from './Avatar';

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Numéro de billet (CRN-XXXXXXX-01) ou de commande (CRN-XXXXXXX) : ouvre directement la liste filtrée. */
const destinationNumero = (q: string) => {
  const n = q.trim().toUpperCase();
  if (/^CRN-[A-Z0-9]{4,}-\d{2}$/.test(n)) return `/admin/collections/titulaires?search=${encodeURIComponent(n)}`;
  if (/^CRN-[A-Z0-9]{4,}$/.test(n)) return `/admin/collections/commandes?search=${encodeURIComponent(n)}`;
  return null;
};

export function MarqueMenu() {
  const [q, setQ] = useState('');
  const chemin = usePathname();
  const routeur = useRouter();

  // Filtre les rubriques du menu pendant la frappe ; un groupe sans rubrique visible est masqué.
  useEffect(() => {
    const cle = normaliser(q);
    const liens = [...document.querySelectorAll<HTMLElement>('.nav .nav__link:not(.crn-menu-tableau)')];
    for (const l of liens) l.style.display = !cle || normaliser(l.textContent ?? '').includes(cle) ? '' : 'none';
    for (const g of document.querySelectorAll<HTMLElement>('.nav .nav-group')) {
      g.style.display = !cle || [...g.querySelectorAll<HTMLElement>('.nav__link')].some((l) => l.style.display !== 'none') ? '' : 'none';
    }
  }, [q]);

  const ouvrir = (e: React.FormEvent) => {
    e.preventDefault();
    const numero = destinationNumero(q);
    const premier = [...document.querySelectorAll<HTMLAnchorElement>('.nav a.nav__link:not(.crn-menu-tableau)')].find((l) => l.style.display !== 'none');
    const cible = numero ?? (q.trim() ? premier?.getAttribute('href') : null);
    if (cible) {
      setQ('');
      routeur.push(cible);
    }
  };

  return (
    <div className="crn-menu-tete">
      <a className="crn-menu-marque" href="/admin">
        <img src="/brand/icon.webp" alt="" width={36} height={36} />
        <span>
          <strong>Convention CRN 2026</strong>
          <span>Back-office</span>
        </span>
      </a>
      <form className="crn-menu-recherche" role="search" onSubmit={ouvrir}>
        <label className="crn-sr" htmlFor="crn-menu-recherche">Rechercher une rubrique, une commande ou un billet</label>
        <input
          id="crn-menu-recherche"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
          placeholder="Rechercher…"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
      <a className={`nav__link crn-menu-tableau${chemin === '/admin' ? ' active' : ''}`} href="/admin" aria-current={chemin === '/admin' ? 'page' : undefined}>
        Tableau de bord
      </a>
    </div>
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
