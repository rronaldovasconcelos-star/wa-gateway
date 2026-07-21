import { env } from '../config/env.js';

export interface EvoResult {
  ok: boolean;
  status: number;
  body: string;
  json: unknown;
}

/**
 * Encaminha uma requisição para a Evolution real. Centraliza a apikey (que nunca
 * sai daqui) e sempre devolve status + corpo, para o chamador decidir o que fazer.
 */
export async function evolutionFetch(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<EvoResult> {
  const url = `${env.evolutionUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.evolutionApiKey,
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.text().catch(() => '');
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, body, json };
}

/** Envio de texto direto (sem fila) — usado pela faixa transacional e pelo alerta. */
export function sendText(instance: string, number: string, text: string): Promise<EvoResult> {
  return evolutionFetch(`/message/sendText/${instance}`, {
    method: 'POST',
    body: { number: number.replace(/\D/g, ''), text },
  });
}

/**
 * Heurística de "número caiu / foi bloqueado". Não existe sinal 100% confiável na
 * Evolution, então tratamos como suspeita de ban/desconexão os casos abaixo — o
 * kill-switch conta falhas consecutivas antes de pausar, evitando falso positivo.
 */
export function looksLikeBanOrDisconnect(r: EvoResult): boolean {
  if (r.status === 401 || r.status === 403) return true;
  const b = r.body.toLowerCase();
  return (
    b.includes('logout') ||
    b.includes('logged out') ||
    b.includes('disconnected') ||
    b.includes('connection closed') ||
    b.includes('not connected') ||
    b.includes('close') && b.includes('state') ||
    b.includes('banned') ||
    b.includes('forbidden')
  );
}
