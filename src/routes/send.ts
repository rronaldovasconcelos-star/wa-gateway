import { Router, type Request, type Response } from 'express';
import { laneOf } from '../core/lanes.js';
import { refreshDaily } from '../core/instanceState.js';
import { takeTransactionalSlot } from '../core/rateLimiter.js';
import { deliver } from '../core/deliver.js';
import { enqueueBulk } from '../queue/enqueue.js';
import { log } from '../lib/log.js';

/**
 * Cria o handler de um endpoint de envio (`sendText` | `sendMedia`). `forceBulk`
 * é true nas rotas `/gw/bulk/...`. A faixa transacional envia na hora (síncrono);
 * a bulk enfileira e devolve 202.
 */
function makeSendHandler(endpoint: string, forceBulk: boolean) {
  return async (req: Request, res: Response): Promise<void> => {
    const instance = req.params.instance;
    const number = String(req.body?.number ?? '').replace(/\D/g, '');
    if (!number) {
      res.status(400).json({ error: 'campo "number" ausente ou inválido' });
      return;
    }
    const lane = laneOf(req, forceBulk);

    // ---- Faixa BULK: enfileira e retorna ----
    if (lane === 'bulk') {
      const jobId = await enqueueBulk({
        instance,
        endpoint,
        number,
        payload: req.body,
        jobGroup: req.header('x-wa-group') ?? null,
      });
      res.status(202).json({ queued: true, jobId, lane });
      return;
    }

    // ---- Faixa TRANSACIONAL: síncrona, com tetos de segurança ----
    const { state, remaining } = await refreshDaily(instance);
    if (state.paused) {
      res.status(503).json({ error: 'instância pausada pelo gateway', reason: state.pauseReason });
      return;
    }
    if (remaining <= 0) {
      res.status(429).json({ error: 'teto diário atingido para esta instância', sentToday: state.sentToday });
      return;
    }
    const gotSlot = await takeTransactionalSlot(instance);
    if (!gotSlot) {
      res.status(429).json({ error: 'limite de taxa (transacional) — tente novamente em instantes' });
      return;
    }

    const { result } = await deliver(instance, endpoint, number, req.body, 'transactional');
    // Espelha o status/corpo real da Evolution para o chamador não perceber diferença.
    res.status(result.status).type('application/json').send(result.body || '{}');
    log('info', 'send.transactional', { instance, endpoint, ok: result.ok, status: result.status });
  };
}

export const sendRouter = Router();

// Compatível com a Evolution (drop-in): mesmos paths.
sendRouter.post('/message/sendText/:instance', makeSendHandler('sendText', false));
sendRouter.post('/message/sendMedia/:instance', makeSendHandler('sendMedia', false));

// Opt-in explícito de bulk por rota dedicada (alternativa ao header X-WA-Priority).
sendRouter.post('/gw/bulk/sendText/:instance', makeSendHandler('sendText', true));
sendRouter.post('/gw/bulk/sendMedia/:instance', makeSendHandler('sendMedia', true));
