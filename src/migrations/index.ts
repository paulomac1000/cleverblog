import * as migration_20260829_100834_initial_schema from './20260829_100834_initial_schema';
import * as migration_20260829_110538_add_media_legacy_meta from './20260829_110538_add_media_legacy_meta';
import * as migration_20260829_114509_add_category_description from './20260829_114509_add_category_description';

export const migrations = [
  {
    up: migration_20260829_100834_initial_schema.up,
    down: migration_20260829_100834_initial_schema.down,
    name: '20260829_100834_initial_schema',
  },
  {
    up: migration_20260829_110538_add_media_legacy_meta.up,
    down: migration_20260829_110538_add_media_legacy_meta.down,
    name: '20260829_110538_add_media_legacy_meta',
  },
  {
    up: migration_20260829_114509_add_category_description.up,
    down: migration_20260829_114509_add_category_description.down,
    name: '20260829_114509_add_category_description'
  },
];
