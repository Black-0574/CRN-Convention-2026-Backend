import { sql } from '@payloadcms/db-sqlite'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`speakers\` ADD \`slug\` text;`)
  await db.run(sql`CREATE UNIQUE INDEX \`speakers_slug_idx\` ON \`speakers\` (\`slug\`);`)
  await db.run(sql`ALTER TABLE \`settings\` ADD \`contenu_initial_importe\` integer DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`speakers_slug_idx\`;`)
  await db.run(sql`ALTER TABLE \`speakers\` DROP COLUMN \`slug\`;`)
  await db.run(sql`ALTER TABLE \`settings\` DROP COLUMN \`contenu_initial_importe\`;`)
}
