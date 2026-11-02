import type { CollectionConfig } from 'payload';

import { bioField, fonctionField, reseauxSociauxField, slugField } from '../fields/profil';

// Même fiche que les orateurs (F-CNV-012 : fiches orateurs et artistes), sans catégorie ni date
// de publication : « Actif » décoché masque l'artiste du site.
export const Artists: CollectionConfig = {
  slug: 'artists',
  labels: { singular: 'Artiste', plural: 'Artistes' },
  admin: { useAsTitle: 'nom', defaultColumns: ['nom', 'fonction', 'actif'] },
  access: { read: () => true },
  fields: [
    { name: 'nom', type: 'text', label: 'Nom', required: true },
    fonctionField('Chantre, groupe de louange'),
    slugField('artistes'),
    { name: 'photo', type: 'upload', relationTo: 'media', admin: { description: 'Photo réelle uniquement — jamais de visage généré par IA.' } },
    bioField('artistes', 'de l’artiste'),
    reseauxSociauxField,
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
