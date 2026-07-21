export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Inteiro aleatório em [min, max]. */
export function jitter(min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Chave do dia local ("YYYY-MM-DD") usada para resetar o contador diário. */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Dias inteiros decorridos desde `start` (>= 0). Usado na curva de warmup. */
export function daysSince(start: Date, now: Date = new Date()): number {
  const ms = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
