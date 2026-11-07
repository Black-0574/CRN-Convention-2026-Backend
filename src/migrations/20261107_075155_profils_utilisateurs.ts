import { sql } from '@payloadcms/db-sqlite'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`photos_profil\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	\`sizes_avatar_url\` text,
  	\`sizes_avatar_width\` numeric,
  	\`sizes_avatar_height\` numeric,
  	\`sizes_avatar_mime_type\` text,
  	\`sizes_avatar_filesize\` numeric,
  	\`sizes_avatar_filename\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`photos_profil_updated_at_idx\` ON \`photos_profil\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`photos_profil_created_at_idx\` ON \`photos_profil\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`photos_profil_filename_idx\` ON \`photos_profil\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`photos_profil_sizes_avatar_sizes_avatar_filename_idx\` ON \`photos_profil\` (\`sizes_avatar_filename\`);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`nom_affiche\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`prenom\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`photo_id\` integer REFERENCES photos_profil(id);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`telephone\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`fonction\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`service\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`seance_scan_id\` integer REFERENCES plateformes(id);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`poste_scan\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`statut\` text DEFAULT 'actif' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`derniere_connexion\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`notes_internes\` text;`)
  // Comptes existants : nom affiché repris du nom saisi (prénom laissé vide, rien n'est déduit).
  await db.run(sql`UPDATE \`users\` SET \`nom_affiche\` = \`nom\`;`)
  await db.run(sql`CREATE INDEX \`users_photo_idx\` ON \`users\` (\`photo_id\`);`)
  await db.run(sql`CREATE INDEX \`users_seance_scan_idx\` ON \`users\` (\`seance_scan_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`photos_profil_id\` integer REFERENCES photos_profil(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_photos_profil_id_idx\` ON \`payload_locked_documents_rels\` (\`photos_profil_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`photos_profil\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nom\` text NOT NULL,
  	\`role\` text DEFAULT 'editeur' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_users\`("id", "nom", "role", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "login_attempts", "lock_until") SELECT "id", "nom", "role", "updated_at", "created_at", "email", "reset_password_token", "reset_password_expiration", "salt", "hash", "login_attempts", "lock_until" FROM \`users\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
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
  	\`categories_id\` integer,
  	\`plateformes_id\` integer,
  	\`quotas_id\` integer,
  	\`produits_id\` integer,
  	\`variantes_id\` integer,
  	\`commandes_id\` integer,
  	\`reservations_id\` integer,
  	\`evenements_webhook_id\` integer,
  	\`titulaires_id\` integer,
  	\`droits_acces_id\` integer,
  	\`scans_id\` integer,
  	\`retraits_id\` integer,
  	\`points_livraison_id\` integer,
  	\`consentements_id\` integer,
  	\`journal_actions_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`venues_id\`) REFERENCES \`venues\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`artists_id\`) REFERENCES \`artists\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`faq_id\`) REFERENCES \`faq\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`speakers_id\`) REFERENCES \`speakers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`announcements_id\`) REFERENCES \`announcements\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`program_days_id\`) REFERENCES \`program_days\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`plateformes_id\`) REFERENCES \`plateformes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`quotas_id\`) REFERENCES \`quotas\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`produits_id\`) REFERENCES \`produits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`variantes_id\`) REFERENCES \`variantes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`commandes_id\`) REFERENCES \`commandes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`reservations_id\`) REFERENCES \`reservations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`evenements_webhook_id\`) REFERENCES \`evenements_webhook\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`titulaires_id\`) REFERENCES \`titulaires\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`droits_acces_id\`) REFERENCES \`droits_acces\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`scans_id\`) REFERENCES \`scans\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`retraits_id\`) REFERENCES \`retraits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`points_livraison_id\`) REFERENCES \`points_livraison\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`consentements_id\`) REFERENCES \`consentements\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`journal_actions_id\`) REFERENCES \`journal_actions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "venues_id", "artists_id", "faq_id", "speakers_id", "products_id", "announcements_id", "program_days_id", "categories_id", "plateformes_id", "quotas_id", "produits_id", "variantes_id", "commandes_id", "reservations_id", "evenements_webhook_id", "titulaires_id", "droits_acces_id", "scans_id", "retraits_id", "points_livraison_id", "consentements_id", "journal_actions_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "venues_id", "artists_id", "faq_id", "speakers_id", "products_id", "announcements_id", "program_days_id", "categories_id", "plateformes_id", "quotas_id", "produits_id", "variantes_id", "commandes_id", "reservations_id", "evenements_webhook_id", "titulaires_id", "droits_acces_id", "scans_id", "retraits_id", "points_livraison_id", "consentements_id", "journal_actions_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
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
