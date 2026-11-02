import * as migration_20261101_141150 from './20261101_141150';
import * as migration_20261101_224214 from './20261101_224214';
import * as migration_20261102_074843 from './20261102_074843';

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
    name: '20261102_074843'
  },
];
