import { sql } from '@payloadcms/db-sqlite'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`categories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nom\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`pole\` text NOT NULL,
  	\`ordre\` numeric DEFAULT 0,
  	\`actif\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`categories_slug_idx\` ON \`categories\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`categories_updated_at_idx\` ON \`categories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`categories_created_at_idx\` ON \`categories\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`plateformes\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nom\` text NOT NULL,
  	\`code\` text NOT NULL,
  	\`debut\` text,
  	\`fin\` text,
  	\`lieu\` text,
  	\`publique\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`plateformes_code_idx\` ON \`plateformes\` (\`code\`);`)
  await db.run(sql`CREATE INDEX \`plateformes_updated_at_idx\` ON \`plateformes\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`plateformes_created_at_idx\` ON \`plateformes\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`quotas\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nom\` text NOT NULL,
  	\`capacite\` numeric,
  	\`vendus\` numeric DEFAULT 0,
  	\`reserves\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`quotas_updated_at_idx\` ON \`quotas\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`quotas_created_at_idx\` ON \`quotas\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`produits_paliers\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`prix_x_a_f\` numeric NOT NULL,
  	\`du\` text NOT NULL,
  	\`au\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`produits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`produits_paliers_order_idx\` ON \`produits_paliers\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`produits_paliers_parent_id_idx\` ON \`produits_paliers\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`produits_kit\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`produit_id\` integer NOT NULL,
  	\`quantite\` numeric DEFAULT 1 NOT NULL,
  	FOREIGN KEY (\`produit_id\`) REFERENCES \`produits\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`produits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`produits_kit_order_idx\` ON \`produits_kit\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`produits_kit_parent_id_idx\` ON \`produits_kit\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`produits_kit_produit_idx\` ON \`produits_kit\` (\`produit_id\`);`)
  await db.run(sql`CREATE TABLE \`produits\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nom\` text NOT NULL,
  	\`slug\` text,
  	\`type\` text NOT NULL,
  	\`categorie_id\` integer,
  	\`resume\` text,
  	\`description\` text,
  	\`age_min\` numeric,
  	\`age_max\` numeric,
  	\`badge\` text,
  	\`actif\` integer DEFAULT false,
  	\`prix_a_valider\` integer DEFAULT true,
  	\`mis_en_avant\` integer DEFAULT false,
  	\`ordre_mise_en_avant\` numeric DEFAULT 100,
  	\`ordre\` numeric DEFAULT 100,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`categorie_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`produits_slug_idx\` ON \`produits\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`produits_categorie_idx\` ON \`produits\` (\`categorie_id\`);`)
  await db.run(sql`CREATE INDEX \`produits_updated_at_idx\` ON \`produits\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`produits_created_at_idx\` ON \`produits\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`produits_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`plateformes_id\` integer,
  	\`quotas_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`produits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`plateformes_id\`) REFERENCES \`plateformes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`quotas_id\`) REFERENCES \`quotas\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`produits_rels_order_idx\` ON \`produits_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`produits_rels_parent_idx\` ON \`produits_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`produits_rels_path_idx\` ON \`produits_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`produits_rels_media_id_idx\` ON \`produits_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`produits_rels_plateformes_id_idx\` ON \`produits_rels\` (\`plateformes_id\`);`)
  await db.run(sql`CREATE INDEX \`produits_rels_quotas_id_idx\` ON \`produits_rels\` (\`quotas_id\`);`)
  await db.run(sql`CREATE TABLE \`variantes\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`produit_id\` integer NOT NULL,
  	\`libelle\` text NOT NULL,
  	\`sku\` text,
  	\`stock\` numeric,
  	\`stock_vendu\` numeric DEFAULT 0,
  	\`stock_reserve\` numeric DEFAULT 0,
  	\`seuil_alerte\` numeric,
  	\`ordre\` numeric DEFAULT 0,
  	\`actif\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`produit_id\`) REFERENCES \`produits\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`variantes_produit_idx\` ON \`variantes\` (\`produit_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`variantes_sku_idx\` ON \`variantes\` (\`sku\`);`)
  await db.run(sql`CREATE INDEX \`variantes_updated_at_idx\` ON \`variantes\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`variantes_created_at_idx\` ON \`variantes\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`variantes_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`plateformes_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`variantes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`plateformes_id\`) REFERENCES \`plateformes\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`variantes_rels_order_idx\` ON \`variantes_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`variantes_rels_parent_idx\` ON \`variantes_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`variantes_rels_path_idx\` ON \`variantes_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`variantes_rels_plateformes_id_idx\` ON \`variantes_rels\` (\`plateformes_id\`);`)
  await db.run(sql`CREATE TABLE \`commandes_lignes\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`produit_id\` integer NOT NULL,
  	\`variante_id\` integer NOT NULL,
  	\`libelle\` text NOT NULL,
  	\`quantite\` numeric NOT NULL,
  	\`prix_unitaire_x_a_f\` numeric NOT NULL,
  	\`kit_de\` text,
  	FOREIGN KEY (\`produit_id\`) REFERENCES \`produits\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`variante_id\`) REFERENCES \`variantes\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`commandes\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`commandes_lignes_order_idx\` ON \`commandes_lignes\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`commandes_lignes_parent_id_idx\` ON \`commandes_lignes\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`commandes_lignes_produit_idx\` ON \`commandes_lignes\` (\`produit_id\`);`)
  await db.run(sql`CREATE INDEX \`commandes_lignes_variante_idx\` ON \`commandes_lignes\` (\`variante_id\`);`)
  await db.run(sql`CREATE TABLE \`commandes\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`numero\` text NOT NULL,
  	\`statut\` text DEFAULT 'en_attente' NOT NULL,
  	\`prenom\` text NOT NULL,
  	\`nom\` text NOT NULL,
  	\`email\` text NOT NULL,
  	\`telephone\` text NOT NULL,
  	\`livraison_mode\` text,
  	\`livraison_point_livraison_id\` integer,
  	\`livraison_frais_x_a_f\` numeric DEFAULT 0,
  	\`livraison_destination\` text,
  	\`livraison_adresse\` text,
  	\`livraison_telephone\` text,
  	\`livraison_instructions\` text,
  	\`total_x_a_f\` numeric NOT NULL,
  	\`reservation_expire_a\` text,
  	\`paiement_prestataire\` text,
  	\`paiement_reference_externe\` text,
  	\`paiement_moyen\` text,
  	\`paiement_detail\` text,
  	\`paiement_payee_a\` text,
  	\`provenance_source\` text,
  	\`provenance_emplacement\` text,
  	\`provenance_campagne\` text,
  	\`cgv_version\` text,
  	\`jeton_suivi\` text NOT NULL,
  	\`titulaires_saisis\` text,
  	\`anomalie\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`livraison_point_livraison_id\`) REFERENCES \`points_livraison\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`commandes_numero_idx\` ON \`commandes\` (\`numero\`);`)
  await db.run(sql`CREATE INDEX \`commandes_statut_idx\` ON \`commandes\` (\`statut\`);`)
  await db.run(sql`CREATE INDEX \`commandes_livraison_livraison_point_livraison_idx\` ON \`commandes\` (\`livraison_point_livraison_id\`);`)
  await db.run(sql`CREATE INDEX \`commandes_paiement_paiement_reference_externe_idx\` ON \`commandes\` (\`paiement_reference_externe\`);`)
  await db.run(sql`CREATE INDEX \`commandes_updated_at_idx\` ON \`commandes\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`commandes_created_at_idx\` ON \`commandes\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`reservations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`commande_id\` integer NOT NULL,
  	\`cible\` text NOT NULL,
  	\`cible_id\` numeric NOT NULL,
  	\`quantite\` numeric NOT NULL,
  	\`expire_a\` text NOT NULL,
  	\`statut\` text DEFAULT 'active',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`commande_id\`) REFERENCES \`commandes\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`reservations_commande_idx\` ON \`reservations\` (\`commande_id\`);`)
  await db.run(sql`CREATE INDEX \`reservations_expire_a_idx\` ON \`reservations\` (\`expire_a\`);`)
  await db.run(sql`CREATE INDEX \`reservations_statut_idx\` ON \`reservations\` (\`statut\`);`)
  await db.run(sql`CREATE INDEX \`reservations_updated_at_idx\` ON \`reservations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`reservations_created_at_idx\` ON \`reservations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`evenements_webhook\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`cle\` text NOT NULL,
  	\`reference_commande\` text,
  	\`statut\` text,
  	\`montant_x_a_f\` numeric,
  	\`resultat\` text,
  	\`brut\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`evenements_webhook_cle_idx\` ON \`evenements_webhook\` (\`cle\`);`)
  await db.run(sql`CREATE INDEX \`evenements_webhook_reference_commande_idx\` ON \`evenements_webhook\` (\`reference_commande\`);`)
  await db.run(sql`CREATE INDEX \`evenements_webhook_updated_at_idx\` ON \`evenements_webhook\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`evenements_webhook_created_at_idx\` ON \`evenements_webhook\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`titulaires\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`numero_billet\` text NOT NULL,
  	\`commande_id\` integer NOT NULL,
  	\`produit_id\` integer NOT NULL,
  	\`variante_id\` integer NOT NULL,
  	\`prenom\` text NOT NULL,
  	\`nom\` text NOT NULL,
  	\`telephone\` text NOT NULL,
  	\`email\` text NOT NULL,
  	\`date_naissance\` text,
  	\`taille_tee_shirt\` text,
  	\`empreinte_jeton\` text,
  	\`fichier_billet\` text,
  	\`emis_a\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`commande_id\`) REFERENCES \`commandes\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`produit_id\`) REFERENCES \`produits\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`variante_id\`) REFERENCES \`variantes\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`titulaires_numero_billet_idx\` ON \`titulaires\` (\`numero_billet\`);`)
  await db.run(sql`CREATE INDEX \`titulaires_commande_idx\` ON \`titulaires\` (\`commande_id\`);`)
  await db.run(sql`CREATE INDEX \`titulaires_produit_idx\` ON \`titulaires\` (\`produit_id\`);`)
  await db.run(sql`CREATE INDEX \`titulaires_variante_idx\` ON \`titulaires\` (\`variante_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`titulaires_empreinte_jeton_idx\` ON \`titulaires\` (\`empreinte_jeton\`);`)
  await db.run(sql`CREATE INDEX \`titulaires_updated_at_idx\` ON \`titulaires\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`titulaires_created_at_idx\` ON \`titulaires\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`droits_acces\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`titulaire_id\` integer NOT NULL,
  	\`plateforme_id\` integer NOT NULL,
  	\`statut\` text DEFAULT 'valide' NOT NULL,
  	\`consomme_a\` text,
  	\`poste\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`titulaire_id\`) REFERENCES \`titulaires\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`plateforme_id\`) REFERENCES \`plateformes\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`droits_acces_titulaire_idx\` ON \`droits_acces\` (\`titulaire_id\`);`)
  await db.run(sql`CREATE INDEX \`droits_acces_plateforme_idx\` ON \`droits_acces\` (\`plateforme_id\`);`)
  await db.run(sql`CREATE INDEX \`droits_acces_updated_at_idx\` ON \`droits_acces\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`droits_acces_created_at_idx\` ON \`droits_acces\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`titulaire_plateforme_idx\` ON \`droits_acces\` (\`titulaire_id\`,\`plateforme_id\`);`)
  await db.run(sql`CREATE TABLE \`scans\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`plateforme_id\` integer NOT NULL,
  	\`titulaire_id\` integer,
  	\`resultat\` text NOT NULL,
  	\`poste\` text NOT NULL,
  	\`agent_id\` integer,
  	\`hors_ligne\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`plateforme_id\`) REFERENCES \`plateformes\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`titulaire_id\`) REFERENCES \`titulaires\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`agent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`scans_plateforme_idx\` ON \`scans\` (\`plateforme_id\`);`)
  await db.run(sql`CREATE INDEX \`scans_titulaire_idx\` ON \`scans\` (\`titulaire_id\`);`)
  await db.run(sql`CREATE INDEX \`scans_agent_idx\` ON \`scans\` (\`agent_id\`);`)
  await db.run(sql`CREATE INDEX \`scans_updated_at_idx\` ON \`scans\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`scans_created_at_idx\` ON \`scans\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`retraits\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`commande_id\` integer NOT NULL,
  	\`titulaire_id\` integer,
  	\`variante_id\` integer NOT NULL,
  	\`libelle\` text NOT NULL,
  	\`quantite\` numeric NOT NULL,
  	\`mode\` text NOT NULL,
  	\`destination\` text,
  	\`statut\` text DEFAULT 'a_preparer',
  	\`remis_a\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`commande_id\`) REFERENCES \`commandes\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`titulaire_id\`) REFERENCES \`titulaires\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`variante_id\`) REFERENCES \`variantes\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`retraits_commande_idx\` ON \`retraits\` (\`commande_id\`);`)
  await db.run(sql`CREATE INDEX \`retraits_titulaire_idx\` ON \`retraits\` (\`titulaire_id\`);`)
  await db.run(sql`CREATE INDEX \`retraits_variante_idx\` ON \`retraits\` (\`variante_id\`);`)
  await db.run(sql`CREATE INDEX \`retraits_updated_at_idx\` ON \`retraits\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`retraits_created_at_idx\` ON \`retraits\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`points_livraison\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nom\` text NOT NULL,
  	\`ville\` text NOT NULL,
  	\`pays\` text NOT NULL,
  	\`adresse\` text,
  	\`horaires\` text,
  	\`contact\` text,
  	\`frais_x_a_f\` numeric NOT NULL,
  	\`delai\` text,
  	\`ordre\` numeric DEFAULT 100,
  	\`actif\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`points_livraison_updated_at_idx\` ON \`points_livraison\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`points_livraison_created_at_idx\` ON \`points_livraison\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`consentements\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`commande_id\` integer,
  	\`email\` text NOT NULL,
  	\`telephone\` text,
  	\`finalite\` text DEFAULT 'etre_recontacte_par_le_crn' NOT NULL,
  	\`accepte\` integer DEFAULT false NOT NULL,
  	\`version\` text NOT NULL,
  	\`texte\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`commande_id\`) REFERENCES \`commandes\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`consentements_commande_idx\` ON \`consentements\` (\`commande_id\`);`)
  await db.run(sql`CREATE INDEX \`consentements_updated_at_idx\` ON \`consentements\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`consentements_created_at_idx\` ON \`consentements\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`journal_actions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`utilisateur_id\` integer,
  	\`action\` text NOT NULL,
  	\`collection\` text NOT NULL,
  	\`document\` text,
  	\`details\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`utilisateur_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`journal_actions_utilisateur_idx\` ON \`journal_actions\` (\`utilisateur_id\`);`)
  await db.run(sql`CREATE INDEX \`journal_actions_updated_at_idx\` ON \`journal_actions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`journal_actions_created_at_idx\` ON \`journal_actions\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`reglages_boutique\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`ventes_ouvertes\` integer DEFAULT true,
  	\`livraison_retrait_convention\` integer DEFAULT true,
  	\`livraison_lieu_retrait\` text,
  	\`livraison_horaires_retrait\` text,
  	\`livraison_domicile_actif\` integer DEFAULT false,
  	\`livraison_domicile_zone\` text DEFAULT 'Libreville',
  	\`livraison_domicile_frais_x_a_f\` numeric,
  	\`livraison_domicile_delai\` text,
  	\`livraison_domicile_conditions\` text DEFAULT 'Service exceptionnel, réservé à Libreville : un agent de la COM Boutique vous appelle pour convenir du créneau.',
  	\`consentement_texte\` text DEFAULT 'J’accepte d’être recontacté par le CRN au sujet de ses activités (case facultative, indépendante de l’achat).',
  	\`consentement_version\` text DEFAULT '2026-11-04',
  	\`legal_cgv_version\` text,
  	\`legal_cgv\` text,
  	\`contenu_importe\` integer DEFAULT false,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_produit_url\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_produit_width\` numeric;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_produit_height\` numeric;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_produit_mime_type\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_produit_filesize\` numeric;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_produit_filename\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_fiche_url\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_fiche_width\` numeric;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_fiche_height\` numeric;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_fiche_mime_type\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_fiche_filesize\` numeric;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`sizes_fiche_filename\` text;`)
  await db.run(sql`CREATE INDEX \`media_sizes_produit_sizes_produit_filename_idx\` ON \`media\` (\`sizes_produit_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_fiche_sizes_fiche_filename_idx\` ON \`media\` (\`sizes_fiche_filename\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`categories_id\` integer REFERENCES categories(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`plateformes_id\` integer REFERENCES plateformes(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`quotas_id\` integer REFERENCES quotas(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`produits_id\` integer REFERENCES produits(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`variantes_id\` integer REFERENCES variantes(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`commandes_id\` integer REFERENCES commandes(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`reservations_id\` integer REFERENCES reservations(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`evenements_webhook_id\` integer REFERENCES evenements_webhook(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`titulaires_id\` integer REFERENCES titulaires(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`droits_acces_id\` integer REFERENCES droits_acces(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`scans_id\` integer REFERENCES scans(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`retraits_id\` integer REFERENCES retraits(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`points_livraison_id\` integer REFERENCES points_livraison(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`consentements_id\` integer REFERENCES consentements(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`journal_actions_id\` integer REFERENCES journal_actions(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_plateformes_id_idx\` ON \`payload_locked_documents_rels\` (\`plateformes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_quotas_id_idx\` ON \`payload_locked_documents_rels\` (\`quotas_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_produits_id_idx\` ON \`payload_locked_documents_rels\` (\`produits_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_variantes_id_idx\` ON \`payload_locked_documents_rels\` (\`variantes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_commandes_id_idx\` ON \`payload_locked_documents_rels\` (\`commandes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_reservations_id_idx\` ON \`payload_locked_documents_rels\` (\`reservations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_evenements_webhook_id_idx\` ON \`payload_locked_documents_rels\` (\`evenements_webhook_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_titulaires_id_idx\` ON \`payload_locked_documents_rels\` (\`titulaires_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_droits_acces_id_idx\` ON \`payload_locked_documents_rels\` (\`droits_acces_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_scans_id_idx\` ON \`payload_locked_documents_rels\` (\`scans_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_retraits_id_idx\` ON \`payload_locked_documents_rels\` (\`retraits_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_points_livraison_id_idx\` ON \`payload_locked_documents_rels\` (\`points_livraison_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_consentements_id_idx\` ON \`payload_locked_documents_rels\` (\`consentements_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_journal_actions_id_idx\` ON \`payload_locked_documents_rels\` (\`journal_actions_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`categories\`;`)
  await db.run(sql`DROP TABLE \`plateformes\`;`)
  await db.run(sql`DROP TABLE \`quotas\`;`)
  await db.run(sql`DROP TABLE \`produits_paliers\`;`)
  await db.run(sql`DROP TABLE \`produits_kit\`;`)
  await db.run(sql`DROP TABLE \`produits\`;`)
  await db.run(sql`DROP TABLE \`produits_rels\`;`)
  await db.run(sql`DROP TABLE \`variantes\`;`)
  await db.run(sql`DROP TABLE \`variantes_rels\`;`)
  await db.run(sql`DROP TABLE \`commandes_lignes\`;`)
  await db.run(sql`DROP TABLE \`commandes\`;`)
  await db.run(sql`DROP TABLE \`reservations\`;`)
  await db.run(sql`DROP TABLE \`evenements_webhook\`;`)
  await db.run(sql`DROP TABLE \`titulaires\`;`)
  await db.run(sql`DROP TABLE \`droits_acces\`;`)
  await db.run(sql`DROP TABLE \`scans\`;`)
  await db.run(sql`DROP TABLE \`retraits\`;`)
  await db.run(sql`DROP TABLE \`points_livraison\`;`)
  await db.run(sql`DROP TABLE \`consentements\`;`)
  await db.run(sql`DROP TABLE \`journal_actions\`;`)
  await db.run(sql`DROP TABLE \`reglages_boutique\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`venues_id\` integer,
  	\`artists_id\` integer,
  	\`faq_id\` integer,
  	\`speakers_id\` integer,
  	\`products_id\` integer,
  	\`announcements_id\` integer,
  	\`program_days_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`venues_id\`) REFERENCES \`venues\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`artists_id\`) REFERENCES \`artists\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`faq_id\`) REFERENCES \`faq\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`speakers_id\`) REFERENCES \`speakers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`announcements_id\`) REFERENCES \`announcements\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`program_days_id\`) REFERENCES \`program_days\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "venues_id", "artists_id", "faq_id", "speakers_id", "products_id", "announcements_id", "program_days_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "venues_id", "artists_id", "faq_id", "speakers_id", "products_id", "announcements_id", "program_days_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_venues_id_idx\` ON \`payload_locked_documents_rels\` (\`venues_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_artists_id_idx\` ON \`payload_locked_documents_rels\` (\`artists_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_faq_id_idx\` ON \`payload_locked_documents_rels\` (\`faq_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_speakers_id_idx\` ON \`payload_locked_documents_rels\` (\`speakers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_products_id_idx\` ON \`payload_locked_documents_rels\` (\`products_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_announcements_id_idx\` ON \`payload_locked_documents_rels\` (\`announcements_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_program_days_id_idx\` ON \`payload_locked_documents_rels\` (\`program_days_id\`);`)
  await db.run(sql`DROP INDEX \`media_sizes_produit_sizes_produit_filename_idx\`;`)
  await db.run(sql`DROP INDEX \`media_sizes_fiche_sizes_fiche_filename_idx\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_produit_url\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_produit_width\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_produit_height\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_produit_mime_type\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_produit_filesize\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_produit_filename\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_fiche_url\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_fiche_width\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_fiche_height\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_fiche_mime_type\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_fiche_filesize\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`sizes_fiche_filename\`;`)
}
