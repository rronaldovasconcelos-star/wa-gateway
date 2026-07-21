# WA-Gateway

Camada única na frente da **Evolution API**. Todos os projetos passam a enviar
WhatsApp **por aqui**, e o gateway aplica **uma regra central** que protege os
números de banimento: fila com throttle+jitter, teto diário por instância com
warmup e kill-switch (pausa automática + alerta).

> Design completo: `docs/wa-gateway-design.md` no repositório do Portal CSP.

## Por que existe

A Evolution roda em cima do Baileys (WhatsApp Web **não-oficial**). Banimento é
comportamental: número frio + rajada + conteúdo idêntico = ban. Blindar cada
projeto não escala. O gateway concentra a regra num lugar só — inclusive para
projetos futuros, que só precisam apontar a URL para cá.

## Como funciona

- **Proxy transparente** de tudo que não é envio (conexão, QR, status, restart…).
- **Duas faixas de envio:**
  - **Transacional** (default): repassa **na hora** (bot respondendo, OTP). Sujeita
    a um teto de segurança para conter loops.
  - **Bulk** (`X-WA-Priority: bulk` ou rota `/gw/bulk/...`): vai para **fila** e sai
    em *drip* com jitter (`BULK_MIN_GAP_MS`..`BULK_MAX_GAP_MS`).
- **Teto diário por instância** com **warmup** (curva `WARMUP_CURVE`): número novo
  começa baixo e sobe com a idade.
- **Kill-switch:** sinal de ban/desconexão ou N falhas seguidas → **pausa a
  instância** e avisa o admin por WhatsApp.

## Integração de um projeto (drop-in)

Sem mudar código. No `.env` do projeto:

```diff
- EVOLUTION_API_URL=http://evolution:8080
- EVOLUTION_API_KEY=<apikey-real-da-evolution>
+ EVOLUTION_API_URL=http://wa-gateway:8090
+ EVOLUTION_API_KEY=<GW_API_KEY-do-gateway>
```

O gateway aceita a chave tanto em `x-gw-key` quanto no header `apikey` que os
projetos já mandam — por isso basta trocar a URL e o valor da chave.

Para **disparos em lote**, marque só o sender de lote com o header
`X-WA-Priority: bulk` (ou chame `/gw/bulk/sendText/:instance`). O resto continua
transacional.

## Rotas

| Rota | Função |
|------|--------|
| `POST /message/sendText/:instance` | Envio (transacional; bulk com header `X-WA-Priority: bulk`) |
| `POST /gw/bulk/sendText/:instance` | Envio bulk explícito |
| `GET /gw/status` | Estado por instância: enviadas/teto, fila, pausa |
| `GET /gw/jobs/:jobId` | Status de um envio em lote |
| `POST /gw/instances/:i/pause` \| `/resume` | Controle manual da fila |
| `POST /gw/instances/:i/config` | Ajusta `dailyCapOverride` / `warmupStart` |
| `GET /health` | Health check (sem auth) |
| `* (qualquer outra)` | Proxy transparente para a Evolution |

## Rodar local

```bash
cp .env.example .env      # preencha GW_API_KEY, EVOLUTION_URL, EVOLUTION_APIKEY
npm install
npm run prisma:push       # cria o SQLite (data/gateway.db)
npm run dev
```

## Deploy (Coolify)

1. Novo recurso Docker Compose apontando para este repositório (ou `Dockerfile`).
2. Coloque o serviço na **mesma rede** da Evolution (bloco `networks` no compose)
   e ajuste `EVOLUTION_URL` para o host interno (ex: `http://evolution:8080`).
3. Variáveis: `GW_API_KEY`, `EVOLUTION_APIKEY`, `ALERT_INSTANCE`, `ALERT_TO`, e os
   limites (`WARMUP_CURVE`, `BULK_*`, etc.).
4. Volume persistente em `/app/data` (SQLite). O container roda `prisma db push` no
   start e cria as tabelas.
5. (Opcional, mais forte) Firewall na Evolution para aceitar só o gateway.

## O que NÃO resolve

Corta risco de rajada/volume/número frio. **Não** torna segura prospecção fria em
massa em API não-oficial — para isso, WhatsApp Cloud API oficial. O design já prevê
um provider "cloud-api" futuro roteado por faixa.
