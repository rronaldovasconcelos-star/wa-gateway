import type { Request } from 'express';

export type Lane = 'transactional' | 'bulk';

/**
 * Faixa de uma requisição de envio. Default = transacional (projetos existentes
 * funcionam sem mudança). Opt-in de bulk via header `X-WA-Priority: bulk` ou pela
 * rota dedicada `/gw/bulk/...` (que passa forceBulk=true).
 */
export function laneOf(req: Request, forceBulk = false): Lane {
  if (forceBulk) return 'bulk';
  const p = String(req.header('x-wa-priority') ?? '').toLowerCase();
  return p === 'bulk' ? 'bulk' : 'transactional';
}
