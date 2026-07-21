import { env } from '../config/env.js';
import { sleep } from '../lib/time.js';

/**
 * Balde de tokens por instância, para a faixa TRANSACIONAL. Permite pequenas
 * rajadas (capacity) mas força uma cadência média (refillPerSec). `take()` espera
 * por um token até `maxWaitMs`; se estourar, devolve false (o chamador responde 429).
 */
class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private capacity: number, private refillPerSec: number) {
    this.tokens = capacity;
    this.last = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.last) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
      this.last = now;
    }
  }

  async take(maxWaitMs: number): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }
      const needed = (1 - this.tokens) / this.refillPerSec; // segundos até 1 token
      const waitMs = Math.min(Math.ceil(needed * 1000), deadline - Date.now());
      if (waitMs <= 0) return false;
      await sleep(Math.min(waitMs, 500)); // acorda em passos curtos para reagir a novos tokens
    }
  }
}

const buckets = new Map<string, TokenBucket>();

function bucketFor(instance: string): TokenBucket {
  let b = buckets.get(instance);
  if (!b) {
    b = new TokenBucket(env.txBucketCapacity, env.txRefillPerSec);
    buckets.set(instance, b);
  }
  return b;
}

/** Faixa transacional: aguarda um token do balde da instância. */
export function takeTransactionalSlot(instance: string): Promise<boolean> {
  return bucketFor(instance).take(env.txMaxWaitMs);
}
