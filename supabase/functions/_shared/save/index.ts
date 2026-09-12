// The save system.
//
//   const doc = serialize(league, { meta });
//   await save(store, id, doc);
//   const { league, migration } = await load(store, id);
//
// Loading always runs the migration chain, so a caller cannot accidentally read
// an old save without upgrading it.

export { SAVE_SCHEMA_VERSION, MIN_SUPPORTED_VERSION, VERSION_LOG, SaveVersionError, assertLoadable }
  from './version.ts';
export { serialize, type SerializeOptions } from './serialize.ts';
export { deserialize, SaveCorruptError, type LoadedSave } from './deserialize.ts';
export { migrate, versionOf, MIGRATIONS, MigrationError, type MigrationReport, type MigrationStep }
  from './migrations.ts';
export { checkIntegrity, describeViolations, type Violation } from './integrity.ts';
export {
  load, save, MemorySaveStore, SaveNotFound, type LoadResult, type SaveStore,
} from './store.ts';
export type {
  SaveDocument, SaveMeta, SavedContract, SavedDeadMoney, SavedPlayer, SavedProspect,
  UnknownDocument,
} from './types.ts';
