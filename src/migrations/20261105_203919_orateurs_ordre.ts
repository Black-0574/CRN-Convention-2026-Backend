import { sql } from '@payloadcms/db-sqlite'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`speakers\` ADD \`ordre\` numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`speakers\` DROP COLUMN \`ordre\`;`)
}
