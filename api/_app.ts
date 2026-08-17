import type { IncomingMessage, ServerResponse } from 'node:http';
import { ensureWorld, handle } from '../server/index';

/**
 * Serverless adapter.
 *
 * The storefront is a plain `node:http` app (see `server/index.ts`). Its request
 * handler already takes `(IncomingMessage, ServerResponse)`, which is exactly what
 * this runtime hands us — so there is no second routing table and no reimplemented
 * business logic here. The deterministic core that the 156 tests exercise is the
 * same code answering these requests.
 *
 * One honest caveat: this platform's filesystem is ephemeral, so `DATA_DIR` does not
 * survive a cold start and the ledger re-seeds from genesis. The durable deployment
 * target is Cloud Run with a mounted bucket — see `DEPLOY.md`.
 */
export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await ensureWorld();
    await handle(req, res);
  } catch (e) {
    const err = e as Error;
    process.stderr.write(`unhandled: ${err.message}\n${err.stack ?? ''}\n`);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Something broke on our side. Nothing was charged.');
    }
  }
}
