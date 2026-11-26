import React from 'react';

import { Preventes } from './Preventes';

// Préventes : pass et tickets payés avant l'ouverture de la boutique (26 novembre 2026).
export const metadata = { title: 'Préventes — Convention CRN 2026', robots: { index: false, follow: false } };

export default function Page() {
  return <Preventes />;
}
