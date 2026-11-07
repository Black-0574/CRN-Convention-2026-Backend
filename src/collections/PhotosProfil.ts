import path from 'node:path';

import type { CollectionConfig } from 'payload';

// Photos de profil des comptes du back-office (7 novembre 2026). Jamais publiques, contrairement
// aux médias du site : lisibles des seuls comptes connectés, dans un dossier à part.
export const PhotosProfil: CollectionConfig = {
  slug: 'photos-profil',
  labels: { singular: 'Photo de profil', plural: 'Photos de profil' },
  // Non masquée : un compte non administrateur envoie sa photo depuis « Mon compte » (une
  // collection masquée n'aurait plus de formulaire d'envoi).
  admin: { group: 'Administration' },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
    delete: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
  },
  upload: {
    staticDir: process.env.MEDIA_DIR ? path.join(process.env.MEDIA_DIR, 'profils') : 'media/profils',
    imageSizes: [{ name: 'avatar', width: 160, height: 160, position: 'attention' }],
    adminThumbnail: 'avatar',
    mimeTypes: ['image/*'],
  },
  fields: [],
};
