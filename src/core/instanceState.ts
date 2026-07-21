import { prisma } from '../db.js';
import { env } from '../config/env.js';
import { dayKey, daysSince } from '../lib/time.js';
import { log } from '../lib/log.js';

/** Teto diário de uma instância: override manual, ou a curva de warmup pela idade. */
export function dailyCapFor(warmupStart: Date, override: number | null | undefined, now = new Date()): number {
  if (override && override > 0) return override;
  const age = daysSince(warmupStart, now);
  const curve = env.warmupCurve;
  return age < curve.length ? curve[age] : env.dailyCapRegime;
}

/** Garante a linha de estado da instância (cria na primeira vez que a vemos). */
export async function ensureInstance(instance: string) {
  const existing = await prisma.instanceState.findUnique({ where: { instance } });
  if (existing) return existing;
  log('info', 'instance.first_seen', { instance });
  return prisma.instanceState.create({ data: { instance, dayKey: dayKey() } });
}

/**
 * Estado "fresco" da instância para uma decisão de envio: reseta o contador se
 * virou o dia e devolve teto do dia + quanto já foi enviado.
 */
export async function refreshDaily(instance: string) {
  let st = await ensureInstance(instance);
  const today = dayKey();
  if (st.dayKey !== today) {
    st = await prisma.instanceState.update({
      where: { instance },
      data: { dayKey: today, sentToday: 0 },
    });
  }
  const cap = dailyCapFor(st.warmupStart, st.dailyCapOverride, new Date());
  return { state: st, cap, remaining: Math.max(0, cap - st.sentToday) };
}

/** Registra um envio bem-sucedido: +1 no contador, zera falhas, marca horário. */
export async function recordSuccess(instance: string): Promise<void> {
  await prisma.instanceState.update({
    where: { instance },
    data: { sentToday: { increment: 1 }, consecutiveFailures: 0, lastSendAt: new Date() },
  });
}

/** Registra uma falha; devolve o total consecutivo (para o kill-switch decidir). */
export async function recordFailure(instance: string): Promise<number> {
  const st = await prisma.instanceState.update({
    where: { instance },
    data: { consecutiveFailures: { increment: 1 } },
  });
  return st.consecutiveFailures;
}

export async function pauseInstance(instance: string, reason: string): Promise<void> {
  await prisma.instanceState.update({ where: { instance }, data: { paused: true, pauseReason: reason } });
  log('warn', 'instance.paused', { instance, reason });
}

export async function resumeInstance(instance: string): Promise<void> {
  await prisma.instanceState.update({
    where: { instance },
    data: { paused: false, pauseReason: null, consecutiveFailures: 0 },
  });
  log('info', 'instance.resumed', { instance });
}
