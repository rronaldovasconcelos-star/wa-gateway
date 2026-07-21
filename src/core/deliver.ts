import { prisma } from '../db.js';
import { evolutionFetch, type EvoResult } from './evolution.js';
import { evaluateSendResult } from './killswitch.js';
import type { Lane } from './lanes.js';

/**
 * Entrega efetiva de UMA mensagem à Evolution: encaminha, audita em SendLog e
 * passa o resultado pelo kill-switch (que faz o accounting de sucesso/falha e
 * pausa a instância se preciso). Usada tanto pela faixa transacional quanto pelo
 * worker de bulk — o accounting de teto diário fica no incremento de sucesso.
 */
export async function deliver(
  instance: string,
  endpoint: string,
  number: string,
  payload: unknown,
  lane: Lane,
): Promise<{ result: EvoResult; paused: boolean }> {
  const result = await evolutionFetch(`/message/${endpoint}/${instance}`, { method: 'POST', body: payload });
  await prisma.sendLog.create({
    data: {
      instance,
      lane,
      endpoint,
      number,
      ok: result.ok,
      status: result.status,
      error: result.ok ? null : result.body.slice(0, 500),
    },
  });
  const { paused } = await evaluateSendResult(instance, result);
  return { result, paused };
}
