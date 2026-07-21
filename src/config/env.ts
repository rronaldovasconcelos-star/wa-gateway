import 'dotenv/config';

function opt(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
function num(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const warmupCurve = opt('WARMUP_CURVE', '20,40,80,160,320,500')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

export const env = {
  port: num('PORT', 8090),
  gwApiKey: opt('GW_API_KEY', ''),

  evolutionUrl: opt('EVOLUTION_URL', 'http://evolution:8080').replace(/\/$/, ''),
  evolutionApiKey: opt('EVOLUTION_APIKEY', ''),

  // Faixa transacional (balde de tokens)
  txBucketCapacity: num('TX_BUCKET_CAPACITY', 3),
  txRefillPerSec: num('TX_REFILL_PER_SEC', 0.34),
  txMaxWaitMs: num('TX_MAX_WAIT_MS', 10_000),

  // Faixa bulk (fila com drip)
  bulkMinGapMs: num('BULK_MIN_GAP_MS', 8_000),
  bulkMaxGapMs: num('BULK_MAX_GAP_MS', 20_000),
  bulkMaxAttempts: num('BULK_MAX_ATTEMPTS', 4),

  // Teto diário / warmup
  warmupCurve: warmupCurve.length ? warmupCurve : [20, 40, 80, 160, 320, 500],
  dailyCapRegime: num('DAILY_CAP_REGIME', 500),

  // Kill-switch
  circuitFailureThreshold: num('CIRCUIT_FAILURE_THRESHOLD', 5),
  alertInstance: opt('ALERT_INSTANCE', ''),
  alertTo: opt('ALERT_TO', '').replace(/\D/g, ''),
};

export function assertConfig(): void {
  const missing: string[] = [];
  if (!env.gwApiKey) missing.push('GW_API_KEY');
  if (!env.evolutionApiKey) missing.push('EVOLUTION_APIKEY');
  if (missing.length) {
    throw new Error(`Config faltando: ${missing.join(', ')}`);
  }
}
