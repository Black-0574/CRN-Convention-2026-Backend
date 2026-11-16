import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`canal_billets\` text DEFAULT 'email';`)
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`whatsapp\` text;`)
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`paiement_encaisse_par\` text;`)
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`paiement_encaisse_par_id\` numeric;`)
  await db.run(sql`ALTER TABLE \`reglages_boutique\` ADD \`especes_actif\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`reglages_boutique\` ADD \`especes_lieu\` text DEFAULT 'COM Boutique — Église Centrale, Libreville';`)
  await db.run(sql`ALTER TABLE \`reglages_boutique\` ADD \`especes_horaires\` text;`)
  await db.run(sql`ALTER TABLE \`reglages_boutique\` ADD \`especes_delai_jours\` numeric DEFAULT 5;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`canal_billets\`;`)
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`whatsapp\`;`)
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`paiement_encaisse_par\`;`)
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`paiement_encaisse_par_id\`;`)
  await db.run(sql`ALTER TABLE \`reglages_boutique\` DROP COLUMN \`especes_actif\`;`)
  await db.run(sql`ALTER TABLE \`reglages_boutique\` DROP COLUMN \`especes_lieu\`;`)
  await db.run(sql`ALTER TABLE \`reglages_boutique\` DROP COLUMN \`especes_horaires\`;`)
  await db.run(sql`ALTER TABLE \`reglages_boutique\` DROP COLUMN \`especes_delai_jours\`;`)
}
