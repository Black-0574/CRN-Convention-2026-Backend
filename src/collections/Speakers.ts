import type { CollectionConfig } from 'payload';

import { slugify } from '../lib/slugify';

// Réseaux proposés pour les liens d'un orateur — mêmes pictogrammes au trait que le site
// (src/components/shared/Icon.astro). Simples liens de sortie : aucun widget ni script de ces
// plateformes n'est chargé (NF-CNV-001).
export const RESEAUX_ORATEUR = [
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'X (Twitter)', value: 'x' },
  { label: 'Site web', value: 'site' },
];

export const Speakers: CollectionConfig = {
  slug: 'speakers',
  labels: { singular: 'Orateur', plural: 'Orateurs' },
  admin: { useAsTitle: 'nom', defaultColumns: ['nom', 'fonction', 'categorie', 'datePublication', 'actif'] },
  access: { read: () => true },
  fields: [
    { name: 'nom', type: 'text', label: 'Nom', required: true },
    {
      name: 'fonction',
      type: 'text',
      label: 'Fonction',
      admin: {
        placeholder: 'ex. Pasteur principal, CRN Libreville',
        description: 'Titre ou ministère affiché sous le nom sur la fiche de l’orateur.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      label: 'Identifiant d’adresse',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Adresse de la fiche : /orateurs/<identifiant>. Laisser vide pour le déduire du nom.',
      },
      hooks: {
        beforeValidate: [({ value, data }) => (value ? slugify(String(value)) : slugify(String(data?.nom ?? '')))],
      },
    },
    {
      name: 'categorie',
      type: 'select',
      label: 'Catégorie',
      required: true,
      options: [
        { label: 'Hôte', value: 'hote' },
        { label: 'Orateur international', value: 'international' },
        { label: 'Orateur national', value: 'national' },
        { label: 'Ministère prophétique', value: 'prophetique' },
        { label: 'Intervenante de plateforme', value: 'plateforme' },
      ],
    },
    { name: 'photo', type: 'upload', relationTo: 'media', admin: { description: 'Photo réelle uniquement — jamais de visage généré par IA.' } },
    {
      name: 'bio',
      type: 'textarea',
      label: 'Biographie',
      admin: {
        rows: 12,
        placeholder: 'Rédigez ici la biographie de l’orateur…',
        description:
          'Publiée sur la fiche de l’orateur (/orateurs/<identifiant>). Séparez les paragraphes par une ligne vide. Pour la retirer, effacez tout le texte : la fiche affiche alors « Biographie à paraître ».',
      },
    },
    {
      name: 'reseauxSociaux',
      type: 'array',
      label: 'Réseaux sociaux',
      labels: { singular: 'Lien', plural: 'Liens' },
      admin: {
        description: 'Liens vers les comptes de l’orateur, affichés sous forme d’icônes sur sa fiche. « Ajouter un lien » pour en ajouter, menu ⋮ d’une ligne pour la supprimer.',
        initCollapsed: false,
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'reseau', type: 'select', label: 'Réseau', required: true, options: RESEAUX_ORATEUR, admin: { width: '35%' } },
            {
              name: 'url',
              type: 'text',
              label: 'Adresse du lien',
              required: true,
              admin: { width: '65%', placeholder: 'https://…' },
              validate: (value: unknown) =>
                typeof value === 'string' && /^https:\/\/\S+$/.test(value.trim())
                  ? true
                  : 'Adresse complète commençant par https:// attendue.',
            },
          ],
        },
      ],
    },
    { name: 'videoInvitation', type: 'text', label: "Vidéo d'invitation" },
    {
      name: 'datePublication',
      type: 'date',
      label: 'Date de publication',
      admin: { description: 'Absente ou future = fiche masquée (révélation progressive, voir isPublished côté site).' },
    },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
