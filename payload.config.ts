import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { fr } from '@payloadcms/translations/languages/fr';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from 'payload';
import sharp from 'sharp';

import { Users } from './src/collections/Users';
import { Media } from './src/collections/Media';
import { Venues } from './src/collections/Venues';
import { Artists } from './src/collections/Artists';
import { Faq } from './src/collections/Faq';
import { Speakers } from './src/collections/Speakers';
import { Products } from './src/collections/Products';
import { Announcements } from './src/collections/Announcements';
import { ProgramDays } from './src/collections/ProgramDays';
import { Settings } from './src/globals/Settings';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// Back-office de la Convention CRN 2026 (lot L3). Collections/globals alignés 1:1 sur
// site/src/content.config.ts — voir C:\Users\Mael\.claude\plans\jaunty-cuddling-kahn.md
// (section "Lot L3") pour le contexte complet et le flux de publication.
export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname, 'src'),
    },
    meta: {
      title: 'Back-office — Convention CRN 2026',
      titleSuffix: ' — CRN Convention 2026',
      icons: [{ url: '/brand/favicon.png', type: 'image/png' }],
    },
    components: {
      graphics: {
        Logo: '/components/admin/Logo#Logo',
        Icon: '/components/admin/Icon#Icon',
      },
      header: ['/components/admin/Header#Header'],
    },
  },
  // Back-office réservé à l'équipe francophone du Commanditaire : français seul, pas de
  // sélecteur de langue.
  i18n: {
    fallbackLanguage: 'fr',
    supportedLanguages: { fr },
    // Corrige un intitulé resté non traduit dans le pack français officiel de Payload
    // ("Globals(es)" — @payloadcms/translations/languages/fr, clé general.globals).
    translations: {
      fr: {
        general: {
          globals: 'Réglages généraux',
        },
      },
    },
  },
  collections: [Users, Media, Venues, Artists, Faq, Speakers, Products, Announcements, ProgramDays],
  globals: [Settings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'src/payload-types.ts'),
  },
  // SQLite (fichier local) plutôt que PostgreSQL : tourne sans serveur de base de données dédié,
  // compatible avec un hébergement mutualisé (Hostinger) qui n'offre pas Docker/Postgres.
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || 'file:./crn-convention.db',
    },
  }),
  sharp,
  // Autorise uniquement le site public (ou le serveur de build) à appeler l'API — l'API n'est de
  // toute façon jamais appelée depuis le navigateur du visiteur (voir flux de publication).
  cors: [process.env.SITE_URL || 'http://localhost:4321'],
});
