import React from 'react';

import { Caisse } from './Caisse';

// Caisse de la COM Boutique : encaissement des commandes payées en espèces (16 novembre 2026).
export const metadata = { title: 'Caisse — Convention CRN 2026', robots: { index: false, follow: false } };

export default function Page() {
  return <Caisse />;
}
