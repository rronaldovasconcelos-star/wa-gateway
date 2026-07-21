import { env } from '../config/env.js';
import { recordFailure, recordSuccess, pauseInstance } from './instanceState.js';
import { looksLikeBanOrDisconnect, type EvoResult } from './evolution.js';
import { alertAdmin } from './alert.js';
import { log } from '../lib/log.js';

/**
 * Avalia o resultado de um envio para o kill-switch/circuito:
 * - sucesso: zera o contador de falhas;
 * - sinal de ban/desconexão: pausa a instância NA HORA e alerta;
 * - falha genérica: conta; ao atingir o limite de falhas seguidas, pausa e alerta.
 * Retorna se a instância foi pausada por causa deste resultado.
 */
export async function evaluateSendResult(instance: string, r: EvoResult): Promise<{ paused: boolean }> {
  if (r.ok) {
    await recordSuccess(instance);
    return { paused: false };
  }

  if (looksLikeBanOrDisconnect(r)) {
    await pauseInstance(instance, `Sinal de ban/desconexão (HTTP ${r.status})`);
    await alertAdmin(
      `Instância *${instance}* PAUSADA — suspeita de banimento/desconexão (HTTP ${r.status}). ` +
        `Fila segurada. Verifique a conexão antes de reativar.`,
    );
    return { paused: true };
  }

  const fails = await recordFailure(instance);
  log('warn', 'send.failure', { instance, status: r.status, consecutive: fails });
  if (fails >= env.circuitFailureThreshold) {
    await pauseInstance(instance, `${fails} falhas consecutivas (circuito aberto)`);
    await alertAdmin(
      `Instância *${instance}* PAUSADA — ${fails} falhas seguidas de envio. Fila segurada.`,
    );
    return { paused: true };
  }
  return { paused: false };
}
