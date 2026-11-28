import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`code_marchand_operateur\` text;`)
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`code_marchand_id_transaction\` text;`)
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`code_marchand_preuve_recue_le\` text;`)
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`code_marchand_preuve\` text;`)
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`code_marchand_choisi_le\` text;`)
  await db.run(sql`ALTER TABLE \`commandes\` ADD \`code_marchand_session_en_ligne\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`code_marchand_operateur\`;`)
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`code_marchand_id_transaction\`;`)
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`code_marchand_preuve_recue_le\`;`)
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`code_marchand_preuve\`;`)
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`code_marchand_choisi_le\`;`)
  await db.run(sql`ALTER TABLE \`commandes\` DROP COLUMN \`code_marchand_session_en_ligne\`;`)
}
