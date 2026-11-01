import { withPayload } from '@payloadcms/next/withPayload';
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Le dépôt a deux package-lock.json (site racine + backend/) : fixe explicitement la racine du
  // projet pour que Turbopack ne tente pas de la déduire (et ne se trompe pas de dossier).
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default withPayload(nextConfig);
