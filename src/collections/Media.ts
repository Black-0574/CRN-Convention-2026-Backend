import type { CollectionConfig } from 'payload';

// Fichiers téléversés (photos orateurs/artistes). Traitement en 480×640 au moment du build du
// site (voir site/scripts et src/lib/cms.ts), ce champ "card" donne déjà un gabarit cohérent
// pour la prévisualisation dans l'admin.
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Média', plural: 'Médias' },
  access: { read: () => true },
  upload: {
    // Chemin absolu en production (MEDIA_DIR) : Hostinger reconstruit l'application dans un
    // nouveau dossier à chaque déploiement, un dossier relatif perdrait les fichiers téléversés.
    staticDir: process.env.MEDIA_DIR || 'media',
    imageSizes: [{ name: 'card', width: 480, height: 640, position: 'attention' }],
    mimeTypes: ['image/*'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      admin: { description: 'Texte alternatif (laisser vide pour une photo décorative).' },
    },
    // Liens inverses (champs « join », sans donnée stockée ici) : depuis la page d'une photo, on
    // voit l'orateur ou l'artiste qui l'utilise et on ouvre sa fiche en un clic. Nom, fonction,
    // biographie et réseaux sociaux restent saisis sur la fiche Orateur — une seule source.
    {
      name: 'orateurs',
      type: 'join',
      collection: 'speakers',
      on: 'photo',
      label: 'Orateur lié à cette photo',
      admin: {
        defaultColumns: ['nom', 'fonction', 'categorie'],
        description: 'Cliquez sur le nom pour ouvrir la fiche et modifier nom, fonction, biographie et réseaux sociaux.',
      },
    },
    {
      name: 'artistes',
      type: 'join',
      collection: 'artists',
      on: 'photo',
      label: 'Artiste lié à cette photo',
    },
  ],
};
