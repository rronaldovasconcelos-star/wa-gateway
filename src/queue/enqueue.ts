import { prisma } from '../db.js';

export interface EnqueueInput {
  instance: string;
  endpoint: string; // "sendText" | "sendMedia"
  number: string;
  payload: unknown; // corpo já pronto para a Evolution
  jobGroup?: string | null;
}

/** Coloca um envio na fila bulk. Retorna o id do job (o cliente recebe no 202). */
export async function enqueueBulk(input: EnqueueInput): Promise<string> {
  const job = await prisma.outboxJob.create({
    data: {
      instance: input.instance,
      endpoint: input.endpoint,
      number: input.number,
      payload: JSON.stringify(input.payload),
      jobGroup: input.jobGroup ?? null,
    },
  });
  return job.id;
}
