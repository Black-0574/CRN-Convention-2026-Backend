import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`announcements\` ADD \`article\` text;`)
  await db.run(sql`ALTER TABLE \`announcements\` ADD \`image_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`announcements\` ADD \`slug\` text;`)
  await db.run(sql`CREATE INDEX \`announcements_image_idx\` ON \`announcements\` (\`image_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`announcements_slug_idx\` ON \`announcements\` (\`slug\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_announcements\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`titre\` text NOT NULL,
  	\`texte\` text NOT NULL,
  	\`date\` text NOT NULL,
  	\`ordre\` numeric NOT NULL,
  	\`categorie\` text NOT NULL,
  	\`icone\` text DEFAULT 'newspaper' NOT NULL,
  	\`lien_href\` text,
  	\`lien_label\` text,
  	\`actif\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_announcements\`("id", "titre", "texte", "date", "ordre", "categorie", "icone", "lien_href", "lien_label", "actif", "updated_at", "created_at") SELECT "id", "titre", "texte", "date", "ordre", "categorie", "icone", "lien_href", "lien_label", "actif", "updated_at", "created_at" FROM \`announcements\`;`)
  await db.run(sql`DROP TABLE \`announcements\`;`)
  await db.run(sql`ALTER TABLE \`__new_announcements\` RENAME TO \`announcements\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`announcements_updated_at_idx\` ON \`announcements\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`announcements_created_at_idx\` ON \`announcements\` (\`created_at\`);`)
}
