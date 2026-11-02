import { sql } from '@payloadcms/db-sqlite'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

import { slugify } from '../lib/slugify'

// Artistes : même fiche que les orateurs — fonction, identifiant d'adresse, biographie et liens
// vers leurs réseaux sociaux. Les artistes déjà présents reçoivent un identifiant déduit de leur
// nom (adresse /artistes/<identifiant>), comme le ferait l'admin à leur prochain enregistrement.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`artists_reseaux_sociaux\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`reseau\` text NOT NULL,
  	\`url\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`artists\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`artists_reseaux_sociaux_order_idx\` ON \`artists_reseaux_sociaux\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`artists_reseaux_sociaux_parent_id_idx\` ON \`artists_reseaux_sociaux\` (\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`artists\` ADD \`fonction\` text;`)
  await db.run(sql`ALTER TABLE \`artists\` ADD \`slug\` text;`)
  await db.run(sql`ALTER TABLE \`artists\` ADD \`bio\` text;`)
  await db.run(sql`CREATE UNIQUE INDEX \`artists_slug_idx\` ON \`artists\` (\`slug\`);`)

  const artistes = await db.all<{ id: number; nom: string }>(sql`SELECT \`id\`, \`nom\` FROM \`artists\`;`)
  const pris = new Set<string>()
  for (const { id, nom } of artistes) {
    let slug = slugify(String(nom ?? '')) || `artiste-${id}`
    if (pris.has(slug)) slug = `${slug}-${id}`
    pris.add(slug)
    await db.run(sql`UPDATE \`artists\` SET \`slug\` = ${slug} WHERE \`id\` = ${id};`)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`artists_reseaux_sociaux\`;`)
  await db.run(sql`DROP INDEX \`artists_slug_idx\`;`)
  await db.run(sql`ALTER TABLE \`artists\` DROP COLUMN \`fonction\`;`)
  await db.run(sql`ALTER TABLE \`artists\` DROP COLUMN \`slug\`;`)
  await db.run(sql`ALTER TABLE \`artists\` DROP COLUMN \`bio\`;`)
}
