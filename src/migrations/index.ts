import * as migration_20261101_141150 from './20261101_141150';
import * as migration_20261101_224214 from './20261101_224214';
import * as migration_20261102_074843 from './20261102_074843';
import * as migration_20261102_083128 from './20261102_083128';
import * as migration_20261104_172946_boutique from './20261104_172946_boutique';

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
    name: '20261104_172946_boutique'
  },
];
