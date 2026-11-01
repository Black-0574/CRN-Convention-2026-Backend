import type { CollectionConfig } from 'payload';

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: 'Tarif / billet', plural: 'Billetterie' },
  admin: { useAsTitle: 'nom', defaultColumns: ['nom', 'categorie', 'prixFCFA', 'statut'] },
  access: { read: () => true },
  defaultSort: 'ordre',
  fields: [
    { name: 'nom', type: 'text', required: true },
    {
      name: 'categorie',
      type: 'select',
      label: 'Catégorie',
      required: true,
      options: [
        { label: 'Académie', value: 'academie' },
        { label: 'Plateforme', value: 'plateforme' },
        { label: 'Concert', value: 'concert' },
        { label: 'Boutique', value: 'boutique' },
        { label: 'Pass', value: 'pass' },
      ],
    },
    { name: 'prixFCFA', type: 'number', label: 'Prix (FCFA)', admin: { description: 'Laisser vide = "À annoncer".' } },
    { name: 'description', type: 'textarea', required: true },
    { name: 'lienAchat', type: 'text', label: "Lien d'achat" },
    {
      name: 'statut',
      type: 'select',
      required: true,
      defaultValue: 'disponible',
      options: [
        { label: 'Disponible', value: 'disponible' },
        { label: 'Complet', value: 'complet' },
        { label: 'À annoncer', value: 'a_annoncer' },
      ],
    },
    { name: 'ordre', type: 'number', required: true, label: 'Ordre' },
  ],
};
