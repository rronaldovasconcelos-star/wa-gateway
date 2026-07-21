import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { dailyCapFor, pauseInstance, resumeInstance } from '../core/instanceState.js';

export const adminRouter = Router();

/** Visão geral por instância: warmup, enviadas hoje / teto, fila e pausa. */
adminRouter.get('/gw/status', async (_req: Request, res: Response) => {
  const states = await prisma.instanceState.findMany();
  const queued = await prisma.outboxJob.groupBy({
    by: ['instance', 'status'],
    _count: { _all: true },
  });
  const depthFor = (instance: string, status: string) =>
    queued.find((q) => q.instance === instance && q.status === status)?._count._all ?? 0;

  const now = new Date();
  const data = states.map((s) => {
    const cap = dailyCapFor(s.warmupStart, s.dailyCapOverride, now);
    return {
      instance: s.instance,
      paused: s.paused,
      pauseReason: s.pauseReason,
      warmupStart: s.warmupStart,
      sentToday: s.sentToday,
      dailyCap: cap,
      remaining: Math.max(0, cap - s.sentToday),
      consecutiveFailures: s.consecutiveFailures,
      lastSendAt: s.lastSendAt,
      queue: {
        queued: depthFor(s.instance, 'QUEUED'),
        sending: depthFor(s.instance, 'SENDING'),
        failed: depthFor(s.instance, 'FAILED'),
      },
    };
  });
  res.json({ instances: data });
});

/** Status de um envio em lote específico. */
adminRouter.get('/gw/jobs/:jobId', async (req: Request, res: Response) => {
  const job = await prisma.outboxJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) {
    res.status(404).json({ error: 'job não encontrado' });
    return;
  }
  res.json(job);
});

adminRouter.post('/gw/instances/:instance/pause', async (req: Request, res: Response) => {
  await pauseInstance(req.params.instance, String(req.body?.reason ?? 'pausa manual'));
  res.json({ ok: true });
});

adminRouter.post('/gw/instances/:instance/resume', async (req: Request, res: Response) => {
  await resumeInstance(req.params.instance);
  res.json({ ok: true });
});

/** Ajusta teto/ warmup de uma instância em runtime. */
adminRouter.post('/gw/instances/:instance/config', async (req: Request, res: Response) => {
  const { dailyCapOverride, warmupStart } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (dailyCapOverride === null || typeof dailyCapOverride === 'number') data.dailyCapOverride = dailyCapOverride;
  if (typeof warmupStart === 'string') {
    const d = new Date(warmupStart);
    if (!Number.isNaN(d.getTime())) data.warmupStart = d;
  }
  const updated = await prisma.instanceState.update({ where: { instance: req.params.instance }, data });
  res.json(updated);
});
