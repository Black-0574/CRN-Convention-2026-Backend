import { notFound } from 'next/navigation';
import React from 'react';

import { PaiementSimule } from './PaiementSimule';

// Page de paiement simulée : tient lieu de la page sécurisée de l'agrégateur tant que celui-ci
// n'est pas raccordé (développement local uniquement, jamais en production).
export const metadata = { title: 'Paiement sécurisé (simulation) — Convention CRN 2026', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string; retour?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { ref = '', retour = '' } = await searchParams;
  return <PaiementSimule reference={ref} retour={retour} />;
}
