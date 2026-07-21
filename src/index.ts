import { assertConfig } from './config/env.js';
import { startServer } from './server.js';
import { startWorker } from './queue/worker.js';
import { log } from './lib/log.js';

async function main(): Promise<void> {
  assertConfig();
  startWorker();
  startServer();
  log('info', 'gateway.up', {});
}

main().catch((err) => {
  log('error', 'gateway.fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
