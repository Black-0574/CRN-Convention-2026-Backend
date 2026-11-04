import '@fontsource/source-serif-4/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/700.css';
import type { Metadata, Viewport } from 'next';
import React from 'react';

import './agents.css';

// Pages des agents de la COM Boutique (contrôle d'accès), servies par le back-office : même
// origine que l'API, la session de l'agent passe donc par le cookie du back-office.
export const metadata: Metadata = {
  title: 'Contrôle d’accès — Convention CRN 2026',
  icons: [{ url: '/brand/favicon.png', type: 'image/png' }],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1A2C5B' };

export default function LayoutAgents({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
