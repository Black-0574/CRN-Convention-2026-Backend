import * as migration_20261101_141150 from './20261101_141150';
import * as migration_20261101_224214 from './20261101_224214';
import * as migration_20261102_074843 from './20261102_074843';
import * as migration_20261102_083128 from './20261102_083128';
import * as migration_20261104_172946_boutique from './20261104_172946_boutique';
import * as migration_20261105_203919_orateurs_ordre from './20261105_203919_orateurs_ordre';
import * as migration_20261106_120512_produits_reserve_tests from './20261106_120512_produits_reserve_tests';
import * as migration_20261107_075155_profils_utilisateurs from './20261107_075155_profils_utilisateurs';
import * as migration_20261111_125443_actualites_article_visuel from './20261111_125443_actualites_article_visuel';

export const migrations = [
  {
    up: migration_20261101_141150.up,
    down: migration_20261101_141150.down,
    name: '20261101_141150',
  },
  {
    up: migration_20261101_224214.up,
    down: migration_20261101_224214.down,
    name: '20261101_224214',
  },
  {
    up: migration_20261102_074843.up,
    down: migration_20261102_074843.down,
    name: '20261102_074843',
  },
  {
    up: migration_20261102_083128.up,
    down: migration_20261102_083128.down,
    name: '20261102_083128',
  },
  {
    up: migration_20261104_172946_boutique.up,
    down: migration_20261104_172946_boutique.down,
    name: '20261104_172946_boutique',
  },
  {
    up: migration_20261105_203919_orateurs_ordre.up,
    down: migration_20261105_203919_orateurs_ordre.down,
    name: '20261105_203919_orateurs_ordre',
  },
  {
    up: migration_20261106_120512_produits_reserve_tests.up,
    down: migration_20261106_120512_produits_reserve_tests.down,
    name: '20261106_120512_produits_reserve_tests',
  },
  {
    up: migration_20261107_075155_profils_utilisateurs.up,
    down: migration_20261107_075155_profils_utilisateurs.down,
    name: '20261107_075155_profils_utilisateurs',
  },
  {
    up: migration_20261111_125443_actualites_article_visuel.up,
    down: migration_20261111_125443_actualites_article_visuel.down,
    name: '20261111_125443_actualites_article_visuel'
  },
];
