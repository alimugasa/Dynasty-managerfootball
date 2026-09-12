// Worker body. All the work lives in shard.ts so the threaded and --serial
// paths cannot drift apart.

import { parentPort, workerData } from 'node:worker_threads';
import { loadLeague } from './league.ts';
import { buildShard } from './shard.ts';
import { TRANSFERABLE_KEYS } from './payload.ts';

interface WorkerInput {
  readonly firstSeason: number;
  readonly seasonCount: number;
  readonly baseSeed: number;
}

const input = workerData as WorkerInput;
const league = loadLeague();
const shard = buildShard(
  league,
  input.firstSeason,
  input.seasonCount,
  input.baseSeed,
  () => parentPort?.postMessage({ progress: 1 }),
);

// .buffer is ArrayBufferLike, which admits SharedArrayBuffer; these are all
// plain ArrayBuffers, allocated by the typed arrays in buildShard.
parentPort?.postMessage(
  { done: shard },
  TRANSFERABLE_KEYS.map((key) => shard[key].buffer as ArrayBuffer),
);
