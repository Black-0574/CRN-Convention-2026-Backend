import type { Field } from 'payload';

import { slugify } from '../lib/slugify';

/*
  Champs de profil communs aux orateurs et aux artistes : identifiant d'adresse, fonction,
  biographie et réseaux sociaux. Une seule définition, pour que les deux fiches de l'admin se
  remplissent de la même façon et que le site les affiche de la même façon
  (src/components/speakers/ProfilDetails.astro côté site).
*/

// Réseaux proposés — mêmes pictogrammes au trait que le site (src/components/shared/Icon.astro).
// Simples liens de sortie : aucun widget ni script de ces plateformes n'est chargé (NF-CNV-001).
export const RESEAUX = [
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'X (Twitter)', value: 'x' },
  { label: 'Site web', value: 'site' },
];

/** Identifiant d'adresse de la fiche publique (/<chemin>/<identifiant>), déduit du nom si vide. */
export const slugField = (chemin: string): Field => ({
  name: 'slug',
  type: 'text',
  label: 'Identifiant d’adresse',
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: `Adresse de la fiche : /${chemin}/<identifiant>. Laisser vide pour le déduire du nom.`,
  },
  hooks: {
    beforeValidate: [({ value, data }) => (value ? slugify(String(value)) : slugify(String(data?.nom ?? '')))],
  },
});

export const fonctionField = (exemple: string): Field => ({
  name: 'fonction',
  type: 'text',
  label: 'Fonction',
  admin: {
    placeholder: `ex. ${exemple}`,
    description: 'Titre ou ministère affiché sous le nom sur la fiche.',
  },
});

export const bioField = (chemin: string, qui: string): Field => ({
  name: 'bio',
  type: 'textarea',
  label: 'Biographie',
  admin: {
    rows: 12,
    placeholder: `Rédigez ici la biographie ${qui}…`,
    description: `Publiée sur la fiche (/${chemin}/<identifiant>). Séparez les paragraphes par une ligne vide. Pour la retirer, effacez tout le texte : la fiche affiche alors « Biographie à paraître ».`,
  },
});

export const reseauxSociauxField: Field = {
  name: 'reseauxSociaux',
  type: 'array',
  label: 'Réseaux sociaux',
  labels: { singular: 'Lien', plural: 'Liens' },
  admin: {
    description: 'Liens vers les comptes, affichés sous forme d’icônes sur la fiche. « Ajouter Lien » pour en ajouter, menu ⋮ d’une ligne pour la supprimer.',
    initCollapsed: false,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'reseau', type: 'select', label: 'Réseau', required: true, options: RESEAUX, admin: { width: '35%' } },
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
};
