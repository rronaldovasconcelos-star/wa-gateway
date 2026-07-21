/** Log estruturado simples (uma linha JSON por evento) para o painel/observabilidade. */
export function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void {
  const line = { t: new Date().toISOString(), level, event, ...data };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(line));
}
