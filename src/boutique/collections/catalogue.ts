/**
 * Catalogue : catégories, plateformes (séances donnant lieu à un droit d'accès), quotas, produits
 * et variantes. Modèle validé (plan, section 3). Lecture publique limitée à ce que la vitrine
 * affiche ; écriture réservée au rôle « catalogue » (et à l'administrateur).
 */
import { palierDepuisJours, verifierPaliers } from '../domaine/src/index.ts';
import { APIError, type CollectionConfig } from 'payload';

import { reserveA, tout } from '../lib/acces';
import { dateHeure } from './dates';
import { slugify } from '../../lib/slugify';

const ecritureCatalogue = { create: reserveA('catalogue'), update: reserveA('catalogue'), delete: reserveA('catalogue') };

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Catégorie', plural: 'Catégories' },
  admin: { useAsTitle: 'nom', defaultColumns: ['nom', 'pole', 'ordre', 'actif'], group: 'Boutique · Catalogue' },
  access: { read: tout, ...ecritureCatalogue },
  fields: [
    { name: 'nom', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, admin: { position: 'sidebar' } },
    {
      name: 'pole',
      type: 'select',
      label: 'Pôle',
      required: true,
      options: [
        { label: 'Billetterie', value: 'billetterie' },
        { label: 'Articles (physique)', value: 'physique' },
        { label: 'Numérique', value: 'numerique' },
      ],
    },
    { name: 'ordre', type: 'number', defaultValue: 0 },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};

export const Plateformes: CollectionConfig = {
  slug: 'plateformes',
  labels: { singular: 'Plateforme (séance)', plural: 'Plateformes (séances)' },
  admin: {
    useAsTitle: 'nom',
    defaultColumns: ['nom', 'code', 'debut', 'lieu'],
    group: 'Boutique · Catalogue',
    description:
      'Chaque séance à l’entrée de laquelle un billet est scanné (une classe de l’Académie un jour donné, le Concert VIP…). Un pass ouvre un droit par séance, consommé séparément.',
  },
  access: { read: tout, ...ecritureCatalogue },
  fields: [
    { name: 'nom', type: 'text', required: true },
    { name: 'code', type: 'text', required: true, unique: true, admin: { description: 'Identifiant stable (ex. academie-classe-1-2026-12-08).' } },
    dateHeure('debut', 'Début'),
    dateHeure('fin', 'Fin'),
    { name: 'lieu', type: 'text', admin: { description: 'Laisser vide = « Lieu à annoncer ».' } },
    {
      name: 'publique',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Décoché : jamais mentionnée sur la vitrine (ex. repas privé), seulement sur le billet du titulaire.' },
    },
  ],
};

export const Quotas: CollectionConfig = {
  slug: 'quotas',
  labels: { singular: 'Quota', plural: 'Quotas' },
  admin: {
    useAsTitle: 'nom',
    defaultColumns: ['nom', 'capacite', 'vendus', 'reserves'],
    group: 'Boutique · Catalogue',
    description: 'Places limitées partagées entre plusieurs produits (ex. Dîner des Élites vendu seul et dans des pass). Aucune survente : chaque réservation est vérifiée de façon atomique.',
  },
  access: { read: reserveA('catalogue', 'comptabilite', 'com_boutique'), ...ecritureCatalogue },
  fields: [
    { name: 'nom', type: 'text', required: true },
    {
      name: 'capacite',
      type: 'number',
      label: 'Capacité',
      min: 0,
      admin: { description: 'Vide = quota à paramétrer : les produits concernés ne peuvent pas être vendus.' },
    },
    { name: 'vendus', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'reserves', type: 'number', label: 'Réservés (paiement en cours)', defaultValue: 0, admin: { readOnly: true } },
  ],
};

const paliersField = {
  name: 'paliers',
  type: 'array' as const,
  label: 'Prix (paliers datés)',
  labels: { singular: 'Palier', plural: 'Paliers' },
  admin: {
    description:
      'Aucun palier = pas en vente seul (ex. article de kit). Un seul palier = prix fixe. Plusieurs paliers = bascule automatique à 00h00, heure de Libreville. Jours inclus ; « Jusqu’au » vide = sans limite.',
  },
  fields: [
    {
      type: 'row' as const,
      fields: [
        { name: 'prixXAF', type: 'number' as const, label: 'Prix (F CFA)', required: true, min: 1, admin: { width: '34%' } },
        { name: 'du', type: 'text' as const, label: 'Du (AAAA-MM-JJ)', required: true, admin: { width: '33%' } },
        { name: 'au', type: 'text' as const, label: 'Jusqu’au (AAAA-MM-JJ)', admin: { width: '33%' } },
      ],
    },
  ],
  validate: (valeur: unknown) => {
    const lignes = (valeur ?? []) as { prixXAF?: number; du?: string; au?: string | null }[];
    try {
      const erreurs = verifierPaliers(
        lignes.map((l) => palierDepuisJours({ prixXAF: Number(l.prixXAF), du: String(l.du), ...(l.au ? { au: l.au } : {}) })),
      );
      return erreurs.length === 0 ? true : erreurs.join(' ');
    } catch (e) {
      return (e as Error).message;
    }
  },
};

export const Produits: CollectionConfig = {
  slug: 'produits',
  labels: { singular: 'Produit', plural: 'Produits' },
  admin: {
    useAsTitle: 'nom',
    defaultColumns: ['nom', 'type', 'actif', 'prixAValider', 'misEnAvant', 'ordreMiseEnAvant'],
    group: 'Boutique · Catalogue',
  },
  access: { read: tout, ...ecritureCatalogue },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && !data.slug && data.nom) data.slug = slugify(String(data.nom));
        return data;
      },
    ],
    // Pass et tickets : toujours nominatifs (un titulaire et un QR code par exemplaire, émis à
    // l'achat). Un pass en vente doit ouvrir au moins un site : c'est ce que le QR donne comme accès.
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const doc = { ...originalDoc, ...data } as { id?: number; type?: string; actif?: boolean; plateformes?: unknown[] };
        if (!doc.actif || (doc.type !== 'pass' && doc.type !== 'ticket')) return data;
        if ((doc.plateformes ?? []).length > 0) return data;
        const variantes = doc.id
          ? (await req.payload.find({ collection: 'variantes', where: { produit: { equals: doc.id } }, depth: 0, limit: 100, pagination: false, req })).docs
          : [];
        if (!variantes.some((v) => (v.plateformes ?? []).length > 0)) {
          throw new APIError('Un pass ou un ticket en vente doit ouvrir au moins une plateforme (séance et lieu) : c’est l’accès que donnera le QR code du titulaire.', 400, undefined, true);
        }
        return data;
      },
    ],
  },
  fields: [
    { name: 'nom', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      label: 'Identifiant d’adresse',
      unique: true,
      index: true,
      admin: { position: 'sidebar', description: 'Fiche : /produits/<identifiant>. Mêmes identifiants que le site de la Convention.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          options: [
            { label: 'Pass (nominatif)', value: 'pass' },
            { label: 'Ticket (nominatif)', value: 'ticket' },
            { label: 'Article physique', value: 'physique' },
            { label: 'Produit numérique', value: 'numerique' },
          ],
          admin: { width: '50%' },
        },
        { name: 'categorie', type: 'relationship', relationTo: 'categories', admin: { width: '50%' } },
      ],
    },
    { name: 'resume', type: 'text', label: 'Résumé (cartes)', maxLength: 140 },
    { name: 'description', type: 'textarea', admin: { rows: 6 } },
    { name: 'photos', type: 'upload', relationTo: 'media', hasMany: true, admin: { description: 'Photos réelles uniquement. La deuxième photo s’affiche au survol.' } },
    paliersField,
    {
      name: 'plateformes',
      type: 'relationship',
      relationTo: 'plateformes',
      hasMany: true,
      label: 'Droits d’accès ouverts',
      admin: { description: 'Billets : séances ouvertes à chaque titulaire. Une variante peut les remplacer (ex. choix de la classe).' },
    },
    { name: 'quotas', type: 'relationship', relationTo: 'quotas', hasMany: true, label: 'Quotas consommés' },
    {
      name: 'kit',
      type: 'array',
      label: 'Kit inclus (lignes à 0 F CFA à retirer)',
      labels: { singular: 'Article', plural: 'Articles' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'produit', type: 'relationship', relationTo: 'produits', required: true, admin: { width: '60%' } },
            { name: 'quantite', type: 'number', defaultValue: 1, min: 1, required: true, admin: { width: '40%' } },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'ageMin', type: 'number', label: 'Âge minimal (déclaratif)', admin: { width: '50%' } },
        { name: 'ageMax', type: 'number', label: 'Âge maximal (déclaratif)', admin: { width: '50%' } },
      ],
    },
    { name: 'badge', type: 'text', admin: { description: 'Badge sobre (ex. « Inclut le tee-shirt », « Places limitées »).' } },
    {
      name: 'actif',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'En vente. Impossible tant que « Prix à valider » est coché.' },
      validate: (actif: boolean | null | undefined, { siblingData }: { siblingData: { prixAValider?: boolean } }) =>
        actif && siblingData.prixAValider ? 'Un produit au prix non validé par le CRN ne peut pas être mis en vente.' : true,
    },
    {
      name: 'prixAValider',
      type: 'checkbox',
      label: 'Prix à valider',
      defaultValue: true,
      admin: { position: 'sidebar', description: 'Coché tant que la grille tarifaire du CRN n’a pas confirmé ce prix.' },
    },
    { name: 'misEnAvant', type: 'checkbox', label: 'Mis en avant (accueil du site)', defaultValue: false, admin: { position: 'sidebar' } },
    { name: 'ordreMiseEnAvant', type: 'number', label: 'Ordre de mise en avant', defaultValue: 100, admin: { position: 'sidebar' } },
    { name: 'ordre', type: 'number', label: 'Ordre dans la boutique', defaultValue: 100, admin: { position: 'sidebar' } },
  ],
};

export const Variantes: CollectionConfig = {
  slug: 'variantes',
  labels: { singular: 'Variante', plural: 'Variantes' },
  admin: {
    useAsTitle: 'libelle',
    defaultColumns: ['libelle', 'produit', 'stock', 'stockVendu', 'stockReserve', 'actif'],
    group: 'Boutique · Catalogue',
    description: 'Chaque produit a au moins une variante (« Unique »). Stock vide = non suivi.',
  },
  access: { read: tout, ...ecritureCatalogue },
  fields: [
    { name: 'produit', type: 'relationship', relationTo: 'produits', required: true, index: true },
    { name: 'libelle', type: 'text', label: 'Libellé', required: true, admin: { description: 'Ex. « Taille M », « Unique ».' } },
    { name: 'sku', type: 'text', label: 'Référence (SKU)', unique: true },
    {
      type: 'row',
      fields: [
        { name: 'stock', type: 'number', min: 0, admin: { width: '25%', description: 'Vide = non suivi' } },
        { name: 'stockVendu', type: 'number', label: 'Vendus', defaultValue: 0, admin: { width: '25%', readOnly: true } },
        { name: 'stockReserve', type: 'number', label: 'Réservés', defaultValue: 0, admin: { width: '25%', readOnly: true } },
        { name: 'seuilAlerte', type: 'number', label: 'Seuil d’alerte', admin: { width: '25%' } },
      ],
    },
    {
      name: 'plateformes',
      type: 'relationship',
      relationTo: 'plateformes',
      hasMany: true,
      label: 'Droits d’accès propres à cette variante',
      admin: { description: 'Remplace les droits du produit (ex. « Classe 1 » → séances de la classe 1).' },
    },
    { name: 'ordre', type: 'number', defaultValue: 0 },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
