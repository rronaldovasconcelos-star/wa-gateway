import { type Request, type Response } from 'express';
import { evolutionFetch } from '../core/evolution.js';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Proxy transparente para a Evolution: tudo que não é envio (conexão, QR, status,
 * restart, fetchInstances, etc.) passa direto, preservando método, path e query.
 * Assim os painéis de conexão dos projetos continuam funcionando sem mudança.
 */
export async function passthrough(req: Request, res: Response): Promise<void> {
  const hasBody = METHODS_WITH_BODY.has(req.method) && req.body && Object.keys(req.body).length > 0;
  try {
    const r = await evolutionFetch(req.originalUrl, {
      method: req.method,
      body: hasBody ? req.body : undefined,
    });
    res.status(r.status).type('application/json').send(r.body || '{}');
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'falha no proxy para a Evolution' });
  }
}
