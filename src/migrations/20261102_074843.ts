import { sql } from '@payloadcms/db-sqlite'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

// Orateurs : fonction (titre affiché sous le nom) et liens vers leurs réseaux sociaux.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`speakers_reseaux_sociaux\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`reseau\` text NOT NULL,
  	\`url\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`speakers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`speakers_reseaux_sociaux_order_idx\` ON \`speakers_reseaux_sociaux\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`speakers_reseaux_sociaux_parent_id_idx\` ON \`speakers_reseaux_sociaux\` (\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`speakers\` ADD \`fonction\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`speakers_reseaux_sociaux\`;`)
  await db.run(sql`ALTER TABLE \`speakers\` DROP COLUMN \`fonction\`;`)
}
