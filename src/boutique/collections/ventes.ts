/**
 * Ventes : commandes, réservations (15 min), événements de paiement, titulaires, droits d'accès,
 * journal des scans, retraits, consentements et journal des actions. Écritures faites par le
 * serveur (endpoints de la boutique) ; le back-office consulte, et n'agit qu'à travers les
 * actions prévues (réémission, remboursement — Palier 2).
 */
import type { CollectionConfig } from 'payload';

import { personne, reserveA } from '../lib/acces';

const lectureVentes = reserveA('comptabilite', 'com_boutique');
const serveurSeulement = { create: personne, update: personne, delete: personne };

const STATUTS_COMMANDE = [
  { label: 'En attente de paiement', value: 'en_attente' },
  { label: 'Payée', value: 'payee' },
  { label: 'Échouée', value: 'echouee' },
  { label: 'Expirée', value: 'expiree' },
  { label: 'Remboursée', value: 'remboursee' },
  { label: 'À vérifier', value: 'a_verifier' },
];

export const Commandes: CollectionConfig = {
  slug: 'commandes',
  labels: { singular: 'Commande', plural: 'Commandes' },
  admin: {
    useAsTitle: 'numero',
    defaultColumns: ['numero', 'statut', 'totalXAF', 'email', 'createdAt'],
    group: 'Boutique · Ventes',
  },
  access: { read: lectureVentes, ...serveurSeulement, update: reserveA() },
  fields: [
    { name: 'numero', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'statut', type: 'select', options: STATUTS_COMMANDE, required: true, defaultValue: 'en_attente', index: true },
    {
      type: 'row',
      fields: [
        { name: 'prenom', type: 'text', label: 'Prénom', required: true, admin: { width: '25%' } },
        { name: 'nom', type: 'text', required: true, admin: { width: '25%' } },
        { name: 'email', type: 'email', required: true, admin: { width: '25%' } },
        { name: 'telephone', type: 'text', label: 'Téléphone', required: true, admin: { width: '25%' } },
      ],
    },
    {
      name: 'lignes',
      type: 'array',
      admin: { readOnly: true },
      fields: [
        { name: 'produit', type: 'relationship', relationTo: 'produits', required: true },
        { name: 'variante', type: 'relationship', relationTo: 'variantes', required: true },
        { name: 'libelle', type: 'text', required: true },
        { name: 'quantite', type: 'number', required: true },
        { name: 'prixUnitaireXAF', type: 'number', required: true },
        { name: 'kitDe', type: 'text', label: 'Kit inclus dans', admin: { description: 'Ligne à 0 F CFA générée par un pass.' } },
        { name: 'modeLogistique', type: 'text', defaultValue: 'retrait_site' },
      ],
    },
    { name: 'totalXAF', type: 'number', label: 'Total (F CFA)', required: true, admin: { readOnly: true } },
    { name: 'reservationExpireA', type: 'date', label: 'Réservation jusqu’à', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'paiement',
      type: 'group',
      admin: { readOnly: true },
      fields: [
        { name: 'prestataire', type: 'text' },
        { name: 'referenceExterne', type: 'text', index: true },
        { name: 'operateur', type: 'text', label: 'Opérateur' },
        { name: 'telephone', type: 'text', label: 'Téléphone de paiement' },
        { name: 'payeeA', type: 'date', label: 'Payée le', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    {
      name: 'provenance',
      type: 'group',
      label: 'Provenance (mesure)',
      admin: { readOnly: true },
      fields: [
        { name: 'source', type: 'text' },
        { name: 'emplacement', type: 'text' },
        { name: 'campagne', type: 'text' },
      ],
    },
    { name: 'cgvVersion', type: 'text', label: 'CGV acceptées (version)', admin: { readOnly: true } },
    { name: 'jetonSuivi', type: 'text', required: true, admin: { hidden: true } },
    // Titulaires saisis au tunnel, conservés jusqu'au paiement (création des billets à la confirmation).
    { name: 'titulairesSaisis', type: 'json', admin: { hidden: true } },
    { name: 'anomalie', type: 'textarea', admin: { description: 'Renseigné automatiquement si la commande est « à vérifier ».' } },
  ],
};

export const Reservations: CollectionConfig = {
  slug: 'reservations',
  labels: { singular: 'Réservation', plural: 'Réservations' },
  admin: { defaultColumns: ['commande', 'cible', 'quantite', 'statut', 'expireA'], group: 'Boutique · Ventes', hidden: true },
  access: { read: reserveA(), ...serveurSeulement },
  fields: [
    { name: 'commande', type: 'relationship', relationTo: 'commandes', required: true, index: true },
    { name: 'cible', type: 'select', options: ['variante', 'quota'], required: true },
    { name: 'cibleId', type: 'number', required: true },
    { name: 'quantite', type: 'number', required: true },
    { name: 'expireA', type: 'date', required: true, index: true },
    { name: 'statut', type: 'select', options: ['active', 'convertie', 'liberee'], defaultValue: 'active', index: true },
  ],
};

export const EvenementsWebhook: CollectionConfig = {
  slug: 'evenements-webhook',
  labels: { singular: 'Événement de paiement', plural: 'Événements de paiement' },
  admin: { useAsTitle: 'cle', defaultColumns: ['cle', 'statut', 'resultat', 'createdAt'], group: 'Boutique · Ventes' },
  access: { read: reserveA('comptabilite'), ...serveurSeulement },
  fields: [
    { name: 'cle', type: 'text', required: true, unique: true, admin: { description: 'prestataire:identifiant — garantit un traitement unique.' } },
    { name: 'referenceCommande', type: 'text', index: true },
    { name: 'statut', type: 'text' },
    { name: 'montantXAF', type: 'number' },
    { name: 'resultat', type: 'text' },
    { name: 'brut', type: 'json' },
  ],
};

export const Titulaires: CollectionConfig = {
  slug: 'titulaires',
  labels: { singular: 'Titulaire', plural: 'Titulaires' },
  admin: { useAsTitle: 'numeroBillet', defaultColumns: ['numeroBillet', 'prenom', 'nom', 'produit', 'commande'], group: 'Boutique · Ventes' },
  access: { read: lectureVentes, ...serveurSeulement },
  fields: [
    { name: 'numeroBillet', type: 'text', required: true, unique: true },
    { name: 'commande', type: 'relationship', relationTo: 'commandes', required: true, index: true },
    { name: 'produit', type: 'relationship', relationTo: 'produits', required: true },
    { name: 'variante', type: 'relationship', relationTo: 'variantes', required: true },
    {
      type: 'row',
      fields: [
        { name: 'prenom', type: 'text', label: 'Prénom', required: true },
        { name: 'nom', type: 'text', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'telephone', type: 'text', label: 'Téléphone', required: true },
        { name: 'email', type: 'email', required: true },
      ],
    },
    { name: 'dateNaissance', type: 'text', label: 'Date de naissance (déclarée)' },
    { name: 'tailleTeeShirt', type: 'text', label: 'Taille du tee-shirt du kit' },
    { name: 'empreinteJeton', type: 'text', unique: true, index: true, admin: { hidden: true } },
    { name: 'fichierBillet', type: 'text', admin: { hidden: true } },
    { name: 'emisA', type: 'date', label: 'Billet émis le', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
};

export const DroitsAcces: CollectionConfig = {
  slug: 'droits-acces',
  labels: { singular: 'Droit d’accès', plural: 'Droits d’accès' },
  admin: { defaultColumns: ['titulaire', 'plateforme', 'statut', 'consommeA', 'poste'], group: 'Boutique · Contrôle d’accès' },
  access: { read: reserveA('com_boutique'), ...serveurSeulement },
  fields: [
    { name: 'titulaire', type: 'relationship', relationTo: 'titulaires', required: true, index: true },
    { name: 'plateforme', type: 'relationship', relationTo: 'plateformes', required: true, index: true },
    { name: 'statut', type: 'select', options: ['valide', 'consomme', 'annule'], defaultValue: 'valide', required: true },
    { name: 'consommeA', type: 'date', label: 'Consommé le', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'poste', type: 'text' },
  ],
  indexes: [{ fields: ['titulaire', 'plateforme'], unique: true }],
};

export const Scans: CollectionConfig = {
  slug: 'scans',
  labels: { singular: 'Scan', plural: 'Journal des scans' },
  admin: { defaultColumns: ['createdAt', 'plateforme', 'resultat', 'titulaire', 'poste', 'agent'], group: 'Boutique · Contrôle d’accès' },
  access: { read: reserveA('com_boutique'), ...serveurSeulement },
  fields: [
    { name: 'plateforme', type: 'relationship', relationTo: 'plateformes', required: true },
    { name: 'titulaire', type: 'relationship', relationTo: 'titulaires' },
    {
      name: 'resultat',
      type: 'select',
      required: true,
      options: [
        { label: 'Accepté', value: 'accepte' },
        { label: 'Refusé — déjà utilisé', value: 'refuse_deja_utilise' },
        { label: 'Refusé — plateforme non incluse', value: 'refuse_plateforme' },
        { label: 'Refusé — droit annulé', value: 'refuse_annule' },
        { label: 'Refusé — billet invalide', value: 'refuse_invalide' },
      ],
    },
    { name: 'poste', type: 'text', required: true },
    { name: 'agent', type: 'relationship', relationTo: 'users' },
    { name: 'horsLigne', type: 'checkbox', defaultValue: false },
  ],
};

export const Retraits: CollectionConfig = {
  slug: 'retraits',
  labels: { singular: 'Retrait', plural: 'Retraits' },
  admin: { defaultColumns: ['commande', 'libelle', 'quantite', 'statut', 'remisA'], group: 'Boutique · Ventes' },
  access: { read: reserveA('com_boutique'), ...serveurSeulement, update: reserveA('com_boutique') },
  fields: [
    { name: 'commande', type: 'relationship', relationTo: 'commandes', required: true, index: true },
    { name: 'titulaire', type: 'relationship', relationTo: 'titulaires' },
    { name: 'variante', type: 'relationship', relationTo: 'variantes', required: true },
    { name: 'libelle', type: 'text', required: true },
    { name: 'quantite', type: 'number', required: true },
    { name: 'mode', type: 'select', options: [{ label: 'Retrait sur site', value: 'retrait_site' }], defaultValue: 'retrait_site' },
    { name: 'statut', type: 'select', options: [{ label: 'À retirer', value: 'a_retirer' }, { label: 'Remis', value: 'remis' }], defaultValue: 'a_retirer' },
    { name: 'remisA', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
};

export const Consentements: CollectionConfig = {
  slug: 'consentements',
  labels: { singular: 'Consentement', plural: 'Consentements' },
  admin: { defaultColumns: ['email', 'accepte', 'version', 'createdAt'], group: 'Boutique · Ventes' },
  access: { read: reserveA('comptabilite'), ...serveurSeulement },
  fields: [
    { name: 'commande', type: 'relationship', relationTo: 'commandes' },
    { name: 'email', type: 'email', required: true },
    { name: 'telephone', type: 'text' },
    { name: 'finalite', type: 'text', required: true, defaultValue: 'etre_recontacte_par_le_crn' },
    { name: 'accepte', type: 'checkbox', required: true },
    { name: 'version', type: 'text', required: true },
    { name: 'texte', type: 'textarea', required: true },
  ],
};

export const JournalActions: CollectionConfig = {
  slug: 'journal-actions',
  labels: { singular: 'Action', plural: 'Journal des actions' },
  admin: { defaultColumns: ['createdAt', 'utilisateur', 'action', 'collection', 'document'], group: 'Boutique · Réglages' },
  access: { read: reserveA(), ...serveurSeulement },
  fields: [
    { name: 'utilisateur', type: 'relationship', relationTo: 'users' },
    { name: 'action', type: 'text', required: true },
    { name: 'collection', type: 'text', required: true },
    { name: 'document', type: 'text' },
    { name: 'details', type: 'json' },
  ],
};
