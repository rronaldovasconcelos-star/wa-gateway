import express, { type Request, type Response, type NextFunction } from 'express';
import { env } from './config/env.js';
import { sendRouter } from './routes/send.js';
import { adminRouter } from './routes/admin.js';
import { passthrough } from './routes/proxy.js';
import { log } from './lib/log.js';

export function buildServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Health check (sem auth) — usado pelo Coolify.
  app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

  // Auth: aceita a chave do gateway tanto em `x-gw-key` quanto no header `apikey`
  // que os projetos já enviam — assim integrar = trocar só URL e valor da chave.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const key = req.header('x-gw-key') ?? req.header('apikey');
    // Aceita a chave do gateway OU a apikey real da Evolution. Isso permite o
    // "swap transparente": ao mover o domínio da Evolution para o gateway, os
    // chamadores existentes (n8n, Chatwoot, etc.) que já mandam a apikey da
    // Evolution continuam autenticando sem nenhuma mudança neles.
    const ok = !!key && (key === env.gwApiKey || (!!env.evolutionApiKey && key === env.evolutionApiKey));
    if (!ok) {
      res.status(401).json({ error: 'não autorizado (x-gw-key/apikey inválida)' });
      return;
    }
    next();
  });

  // Rotas do gateway (envio com faixas + admin) antes do proxy.
  app.use(sendRouter);
  app.use(adminRouter);

  // Catch-all: tudo o mais é proxy transparente para a Evolution.
  app.use(passthrough);

  return app;
}

export function startServer(): void {
  const app = buildServer();
  app.listen(env.port, () => log('info', 'server.listening', { port: env.port }));
}
