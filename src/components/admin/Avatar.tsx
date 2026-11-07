'use client';

/**
 * Avatar du compte connecté (barre du haut et carte du menu) : photo de profil si elle existe,
 * sinon initiales sur pastille bleu nuit (charte GBIS).
 */
import { useAuth } from '@payloadcms/ui';
import React, { useEffect, useState } from 'react';

type Profil = { prenom?: string | null; nom?: string | null; nomAffiche?: string | null; email?: string; role?: string; photo?: number | { url?: string | null; sizes?: { avatar?: { url?: string | null } } } | null };

export const initiales = (p: Profil | null | undefined) =>
  (p?.nomAffiche || p?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join('');

/** URL de la photo de profil (lue au besoin, la photo pouvant n'être qu'un identifiant). */
export function usePhoto(p: Profil | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const photo = p?.photo;
    if (!photo) return setUrl(null);
    if (typeof photo === 'object') return setUrl(photo.sizes?.avatar?.url ?? photo.url ?? null);
    fetch(`/api/photos-profil/${photo}?depth=0`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUrl(d?.sizes?.avatar?.url ?? d?.url ?? null))
      .catch(() => setUrl(null));
  }, [p?.photo]);
  return url;
}

export function Pastille({ profil, taille = 32 }: { profil: Profil | null | undefined; taille?: number }) {
  const url = usePhoto(profil);
  return (
    <span className="crn-avatar" style={{ width: taille, height: taille, fontSize: Math.max(16, Math.round(taille * 0.4)) }} aria-hidden="true">
      {url ? <img src={url} alt="" width={taille} height={taille} /> : initiales(profil)}
    </span>
  );
}

/** Avatar de la barre du haut (admin.avatar). */
export function Avatar() {
  const { user } = useAuth();
  return <Pastille profil={user as Profil | null} />;
}

export default Avatar;
