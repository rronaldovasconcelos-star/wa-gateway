import { env } from '../config/env.js';
import { sendText } from './evolution.js';
import { log } from '../lib/log.js';

let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 5 * 60_000; // no máx. 1 alerta a cada 5 min (anti-spam de alerta)

/**
 * Alerta ao admin por WhatsApp, enviado DIRETO pela Evolution (fora da fila) por
 * uma instância sã (`ALERT_INSTANCE`). É best-effort: qualquer erro é só logado —
 * o alerta nunca pode disparar um novo kill-switch nem derrubar o fluxo.
 */
export async function alertAdmin(text: string): Promise<void> {
  if (!env.alertInstance || !env.alertTo) {
    log('warn', 'alert.skipped_no_config', {});
    return;
  }
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;
  try {
    await sendText(env.alertInstance, env.alertTo, `🚨 WA-Gateway\n${text}`);
    log('info', 'alert.sent', { to: env.alertTo });
  } catch (err) {
    log('error', 'alert.failed', { error: err instanceof Error ? err.message : String(err) });
  }
}
