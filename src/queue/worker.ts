import { prisma } from '../db.js';
import { env } from '../config/env.js';
import { jitter } from '../lib/time.js';
import { refreshDaily } from '../core/instanceState.js';
import { deliver } from '../core/deliver.js';
import { log } from '../lib/log.js';

const TICK_MS = 1_000;

// Estado em memória do agendamento por instância (single-process).
const nextAllowedAt = new Map<string, number>(); // instância -> timestamp mín. do próximo envio
const inFlight = new Set<string>(); // instâncias com um envio em andamento

/** Um passo do worker: para cada instância com fila, tenta enviar 1 mensagem. */
async function tick(): Promise<void> {
  const pending = await prisma.outboxJob.groupBy({
    by: ['instance'],
    where: { status: 'QUEUED' },
    _count: { _all: true },
  });

  const now = Date.now();
  for (const row of pending) {
    const instance = row.instance;
    if (inFlight.has(instance)) continue;
    if ((nextAllowedAt.get(instance) ?? 0) > now) continue;

    inFlight.add(instance);
    // Não usamos await aqui para não serializar instâncias diferentes entre si;
    // cada instância processa uma msg por vez via inFlight.
    void processOne(instance).finally(() => inFlight.delete(instance));
  }
}

async function processOne(instance: string): Promise<void> {
  const { state, remaining } = await refreshDaily(instance);

  if (state.paused) return; // fila segurada pelo kill-switch
  if (remaining <= 0) {
    // Estourou o teto do dia: espera virar o dia (checa de novo em ~10 min).
    nextAllowedAt.set(instance, Date.now() + 10 * 60_000);
    log('info', 'bulk.daily_cap_reached', { instance, sentToday: state.sentToday });
    return;
  }

  const job = await prisma.outboxJob.findFirst({
    where: { instance, status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
  });
  if (!job) return;

  await prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'SENDING' } });

  let payload: unknown;
  try {
    payload = JSON.parse(job.payload);
  } catch {
    await prisma.outboxJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', lastError: 'payload inválido (JSON)' },
    });
    return;
  }

  const { result, paused } = await deliver(instance, job.endpoint, job.number, payload, 'bulk');

  if (result.ok) {
    await prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'SENT', sentAt: new Date() } });
    nextAllowedAt.set(instance, Date.now() + jitter(env.bulkMinGapMs, env.bulkMaxGapMs));
    return;
  }

  // Falhou. Se o kill-switch pausou a instância, devolve o job pra fila (sai quando resumir).
  const attempts = job.attempts + 1;
  const err = result.body.slice(0, 500);
  if (paused) {
    await prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'QUEUED', attempts, lastError: err } });
    return;
  }
  if (attempts >= env.bulkMaxAttempts) {
    await prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'FAILED', attempts, lastError: err } });
  } else {
    // Backoff simples antes da próxima tentativa desta instância.
    await prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'QUEUED', attempts, lastError: err } });
    nextAllowedAt.set(instance, Date.now() + jitter(env.bulkMinGapMs, env.bulkMaxGapMs) * attempts);
  }
}

let running = false;
export function startWorker(): void {
  log('info', 'worker.started', { minGapMs: env.bulkMinGapMs, maxGapMs: env.bulkMaxGapMs });
  const handle = setInterval(() => {
    if (running) return;
    running = true;
    tick()
      .catch((err) => log('error', 'worker.tick_error', { error: err instanceof Error ? err.message : String(err) }))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  handle.unref?.();
}
