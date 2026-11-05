import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { fr } from '@payloadcms/translations/languages/fr';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig, type CollectionConfig, type GlobalConfig } from 'payload';
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
import { migrations } from './src/migrations';
import { allowedOrigins } from './src/lib/allowed-origins';
import { rebuildAfterChange, rebuildAfterDelete, rebuildAfterGlobalChange } from './src/lib/site-rebuild';
import { completerProfilsOrateurs, organiserOrateurs, seedFromContent } from './src/seed/seed-from-content';
// CRN Boutique, intégrée au back-office : catalogue, ventes, billets, contrôle d'accès (le site
// l'affiche sous /boutique). Plan : C:UsersMael.claudeplansjaunty-cuddling-kahn.md.
import { Categories, Plateformes, Produits, Quotas, Variantes } from './src/boutique/collections/catalogue';
import { PointsLivraison } from './src/boutique/collections/logistique';
import { ReglagesBoutique } from './src/boutique/collections/reglages';
import {
  Commandes,
  Consentements,
  DroitsAcces,
  EvenementsWebhook,
  JournalActions,
  Reservations,
  Retraits,
  Scans,
  Titulaires,
} from './src/boutique/collections/ventes';
import { endpoints as endpointsBoutique } from './src/boutique/endpoints';
import { journaliser } from './src/boutique/lib/journal';
import { demarrerTachesPlanifiees } from './src/boutique/lib/taches';
import { urlBackOffice } from './src/boutique/lib/urls';
import { seedBoutique } from './src/boutique/seed';

if (process.env.BOUTIQUE_DEMO === '1' && process.env.NODE_ENV === 'production') {
  throw new Error('BOUTIQUE_DEMO=1 est réservé au développement local : refusé en production.');
}

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// Toute modification d'un contenu affiché sur le site déclenche sa republication (site statique).
const withSiteRebuild = (c: CollectionConfig): CollectionConfig => ({
  ...c,
  hooks: {
    ...c.hooks,
    afterChange: [...(c.hooks?.afterChange ?? []), rebuildAfterChange],
    afterDelete: [...(c.hooks?.afterDelete ?? []), rebuildAfterDelete],
  },
});
const withGlobalSiteRebuild = (g: GlobalConfig): GlobalConfig => ({
  ...g,
  hooks: { ...g.hooks, afterChange: [...(g.hooks?.afterChange ?? []), rebuildAfterGlobalChange] },
});

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
      beforeDashboard: ['/components/admin/TableauVentes#TableauVentes'],
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
  collections: [
    Users,
    ...[Media, Venues, Artists, Faq, Speakers, Products, Announcements, ProgramDays].map(withSiteRebuild),
    // Catalogue de la boutique : journalisé, et republié sur le site (pages /boutique statiques).
    ...[Categories, Plateformes, Quotas, Produits, Variantes].map(journaliser).map(withSiteRebuild),
    Commandes,
    Reservations,
    EvenementsWebhook,
    Titulaires,
    DroitsAcces,
    Scans,
    Retraits,
    PointsLivraison,
    Consentements,
    JournalActions,
  ],
  globals: [withGlobalSiteRebuild(Settings), withGlobalSiteRebuild(ReglagesBoutique)],
  endpoints: endpointsBoutique,
  // Import initial du contenu du site, une seule fois (src/seed). Un échec ne doit pas empêcher
  // le back-office de démarrer : il est journalisé et retenté au démarrage suivant.
  onInit: async (payload) => {
    try {
      await seedFromContent(payload);
      await completerProfilsOrateurs(payload);
      await organiserOrateurs(payload);
    } catch (err) {
      payload.logger.error(`Import initial du contenu échoué : ${(err as Error).message}`);
    }
    try {
      await seedBoutique(payload);
    } catch (err) {
      payload.logger.error(`Import initial du catalogue de la boutique échoué : ${(err as Error).message}`);
    }
    demarrerTachesPlanifiees(payload);
  },
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
    // Applique les migrations en attente à la connexion en production : l'hébergement
    // (Hostinger) n'offre ni terminal ni node_modules complet pour lancer `payload migrate`.
    prodMigrations: migrations,
  }),
  sharp,
  // Autorise uniquement le site public (ou le serveur de build) à appeler l'API — l'API n'est de
  // toute façon jamais appelée depuis le navigateur du visiteur (voir flux de publication).
  cors: allowedOrigins(),
  // Sessions par cookie (back-office, poste de scan) acceptées seulement depuis ces origines.
  csrf: [...allowedOrigins(), urlBackOffice()],
});
