import type { CollectionConfig } from 'payload';

// Fichiers téléversés (photos orateurs/artistes). Traitement en 480×640 au moment du build du
// site (voir site/scripts et src/lib/cms.ts), ce champ "card" donne déjà un gabarit cohérent
// pour la prévisualisation dans l'admin.
export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  upload: {
    staticDir: '../media',
    imageSizes: [{ name: 'card', width: 480, height: 640, position: 'attention' }],
    mimeTypes: ['image/*'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      admin: { description: 'Texte alternatif (laisser vide pour une photo décorative).' },
    },
  ],
};
