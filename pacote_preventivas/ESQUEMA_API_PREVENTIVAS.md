# Agenda de Preventiva — Contrato da API (v1)

Contrato entre o **SIGA** (servidor Node + PostgreSQL) e os clientes do módulo
**Agenda de Preventiva**: o aplicativo instalado **Preventiva V4** (Python/Tkinter)
e o menu **Gestão › Agenda de Preventiva** do SIGA web/mobile.

A implementação de referência deste contrato está em
`tools/mock_siga_server.py` (Python). Ela roda no computador, sem o SIGA,
e é usada para desenvolver e testar a V4. A implementação definitiva no SIGA
deve se comportar igual a ela; os testes em `tests_v4/test_contract.py`
podem ser apontados para o SIGA de homologação para conferir.

---

## 1. Regras gerais

| Item | Regra |
|---|---|
| Prefixo | `/api/v1/preventives` (rotas novas, **fora** do `/api/state`) |
| Autenticação | Login do SIGA: `POST /api/auth/login` → token; demais chamadas com `Authorization: Bearer <token>` |
| Perfis com acesso | **Service Desk** e **Administrador**. Qualquer outro perfil (inclusive Técnico) recebe `403 forbidden` em todas as rotas do módulo |
| Importação de dados | Somente **Administrador** |
| Formato | JSON UTF-8, nomes em camelCase, datas `YYYY-MM-DD`, instantes ISO 8601 com fuso |
| Fuso | Todo cálculo de data/status no fuso **America/Sao_Paulo** |
| Concorrência | Cada plano e cada visita têm `rev` (inteiro). Toda alteração envia o `rev` lido; se mudou, `409 conflict` com o registro atual em `current` |
| Erros | `{"error": "mensagem em português", "code": "<código>"}` — tabela na seção 9 |
| Limite | Recomendado: 120 requisições/minuto por token nas rotas do módulo |
| Histórico | Toda alteração grava `preventive_history` (visita) e `change_log` (padrão do SIGA) |

---

## 2. Rotas já existentes no SIGA usadas pelo módulo

### `GET /api/health` (sem autenticação)
Usada pela V4 para a tela **"Servidor indisponível"**. Considera-se disponível
quando responde `200` com `"status": "online"`.

### `POST /api/auth/login`
```json
{ "email": "pessoa@alertsystem.com.br", "password": "..." }
```
Resposta esperada: `{ "token": "...", "expiresAt": "2026-11-14T02:00:00Z" }`
(a V4 também aceita `sessionToken`). Sessão de 12 h; ao receber `401` a V4 pede login de novo.
Se a pessoa estiver com `must_change_password`, as rotas do módulo respondem
`403 password_change_required` e a V4 orienta trocar a senha no SIGA.

### `POST /api/auth/logout`
Encerra a sessão.

---

## 3. Sessão e referência

### `GET /me`
Quem está logado e se tem acesso. Chamada logo após o login.
```json
{
  "person": { "id": "p_123", "name": "Nome", "email": "nome@alertsystem.com.br", "profiles": ["Service Desk"] },
  "canAccess": true,
  "canImport": false,
  "apiVersion": "1.0",
  "minDesktopVersion": "4.0.0",
  "serverTime": "2026-11-13T14:50:00-03:00",
  "timezone": "America/Sao_Paulo"
}
```
Se `minDesktopVersion` for maior que a versão instalada, a V4 avisa que precisa ser atualizada e não segue.

### `GET /teams`
```json
[ { "id": "SP", "name": "São Paulo" }, { "id": "BR", "name": "Brasil" } ]
```

### `GET /holidays?from=2026-01-01&to=2030-12-31`
Feriados nacionais **e** regionais (tabela `preventive_holidays`). `teamIds` vazio = vale para todas as equipes.
```json
[
  { "date": "2026-11-20", "name": "Consciência Negra", "teamIds": [] },
  { "date": "2026-07-09", "name": "Revolução Constitucionalista (SP)", "teamIds": ["SP"] }
]
```

---

## 4. Clientes e planos

**Cliente** = registro da tabela `clients` do SIGA (cadastro único).
**Plano** = dados do módulo para aquele cliente (`preventive_plans`). Um cliente do SIGA sem plano é um **cliente pendente**.

Objeto devolvido pelas rotas de cliente:
```json
{
  "id": "c_abc",
  "name": "Cliente Exemplo",
  "city": "São Paulo",
  "state": "SP",
  "active": true,
  "plan": {
    "periodMonths": 3,
    "startMonth": 1,
    "startYear": 2025,
    "teamId": "SP",
    "teamName": "São Paulo",
    "movideskClientId": "CLI-123",
    "contacts": [ { "name": "Fulano", "email": "f@cliente.com", "type": "TO" } ],
    "active": true,
    "rev": 4
  }
}
```

### `GET /clients?includeInactive=false`
Clientes **com plano**. `includeInactive=true` inclui planos inativos.

### `GET /clients/{id}`
Um cliente com plano.

### `GET /clients/pending`
Clientes do SIGA **sem plano** e não dispensados — os que "ficam pendentes perguntando se deseja criar um cronograma".
```json
[ { "id": "c_new", "name": "Cliente Novo", "city": "Campinas", "state": "SP", "createdAt": "2026-11-13T10:00:00-03:00" } ]
```
Regra no SIGA: ao criar um cliente (em qualquer tela do SIGA), gravar também uma
`notification` para as pessoas com perfil Service Desk/Administrador:
*"Cliente X cadastrado. Deseja criar o cronograma de preventivas?"*.

### `POST /clients/{id}/dismiss`
Marca o cliente pendente como "não terá cronograma". Corpo: `{ "reason": "texto" }` (obrigatório).
Sai da lista de pendentes; pode receber plano depois por `POST /clients`.

### `POST /clients`
Cria o plano e o cronograma. **Todo cadastro feito no módulo é criado no SIGA.**
```json
{
  "clientId": null,
  "client": { "name": "Cliente Novo", "city": "", "state": "" },
  "plan": { "periodMonths": 3, "startMonth": 1, "startYear": 2026, "teamId": "SP",
            "movideskClientId": "CLI-9", "contacts": [ { "name": "", "email": "a@b.com", "type": "TO" } ] },
  "plannedDates": [ "2026-01-05", "2026-04-06", "2026-07-06", "2026-10-05" ]
}
```
- `clientId` preenchido → usa o cliente existente do SIGA (fluxo dos pendentes).
- `clientId` nulo → cria o cliente em `clients`. Se já existir cliente com o mesmo nome
  (comparação sem acento e sem maiúsculas), responde `409 client_exists` com
  `{"existing": {"id": "...", "name": "..."}}`; a V4 pergunta se deve vincular e reenvia com `clientId`.
- Já ter plano → `409 plan_exists`.
- Resposta `201`: o cliente com plano + `"visitsCreated": 20`.

### `PUT /clients/{id}`
Atualiza **somente dados do cadastro**: nome, código Movidesk e contatos.
**Não mexe nas visitas** (corrige o problema da V3, em que editar um e-mail apagava reagendamentos, tickets e notificações).
```json
{ "name": "Cliente Novo", "plan": { "movideskClientId": "CLI-9", "contacts": [ ... ] }, "rev": 4 }
```

### `PUT /clients/{id}/schedule`
Replaneja o cronograma (periodicidade, início, equipe e datas).
```json
{ "plan": { "periodMonths": 2, "startMonth": 3, "startYear": 2026, "teamId": "BR" },
  "plannedDates": [ "2026-03-04", "2026-05-06" ], "rev": 4 }
```
Regras:
1. **Visitas protegidas não mudam**: concluídas, com ticket Movidesk, com cliente notificado
   ou reagendadas manualmente. O mês de referência delas continua ocupado.
2. As demais visitas ativas com referência a partir do primeiro mês planejado são desativadas
   (histórico `schedule_replaced`).
3. O novo cronograma é gerado até **dezembro do 5º ano a partir do ano atual** (nunca encolhe).
4. Resposta: o cliente atualizado + `{"visitsCreated": n, "visitsKept": n, "visitsReplaced": n}`.

### `POST /clients/{id}/active`
`{ "active": false }` — inativa/reativa o **plano** (o cliente do SIGA não é afetado).

---

## 5. Visitas (preventivas)

```json
{
  "id": "v_1",
  "legacyId": 152,
  "clientId": "c_abc", "clientName": "Cliente Exemplo",
  "teamId": "SP", "teamName": "São Paulo",
  "referenceDate": "2026-04-05",
  "originalDate": "2026-04-06",
  "scheduledDate": "2026-04-20",
  "completedDate": null,
  "technician": "", "osNumber": "", "ticketNumber": "",
  "summary": "", "resolution": "", "problems": "",
  "notifiedClient": false,
  "overrideDate": false,
  "rescheduled": true,
  "movidesk": { "ticketId": null, "protocol": null, "url": null, "createdAt": null, "lastError": null },
  "status": "Agendado",
  "rev": 3
}
```
`status` é calculado pelo servidor (America/Sao_Paulo):

| Status | Regra |
|---|---|
| Agendado | não concluída e hoje ≤ data agendada |
| Atrasado | não concluída, data passou, ainda no mesmo mês |
| Não realizado | não concluída e o mês da data agendada já passou |
| Concluído | concluída na data agendada |
| Concluído antecipado | concluída antes |
| Concluído com atraso | concluída depois |

### `GET /visits?from=2026-01-01&to=2026-12-31&clientId=&teamId=`
Lista por período de **data agendada** (obrigatório `from` e `to`, máximo 6 anos).

### `GET /visits/occupied?teamId=SP&excludeClientId=&excludeVisitId=`
Datas já ocupadas da equipe (para os seletores de data): `["2026-04-06", ...]`.

### `GET /visits/{id}` · `GET /visits/{id}/history`
Histórico:
```json
[ { "createdAt": "2026-11-13T14:00:00-03:00", "userName": "Nome", "action": "reschedule",
    "oldDate": "2026-04-06", "newDate": "2026-04-20", "details": "Pedido do cliente" } ]
```
Ações: `schedule_created`, `schedule_extended`, `schedule_replaced`, `reschedule`, `execution_saved`,
`client_notified`, `client_notification_undone`, `movidesk_ticket_created`, `movidesk_error`, `imported`.

### `POST /visits/{id}/reschedule`
```json
{ "date": "2026-04-20", "override": false, "reason": "Pedido do cliente", "rev": 3 }
```
- `reason` **obrigatório**.
- Data restrita = fim de semana, feriado (nacional ou da equipe) ou já ocupada pela equipe.
  Com `override: false` e data restrita → `422 date_restricted` com `{"suggestedDate": "2026-04-22"}`.
  Com `override: true` → aceita e grava `overrideDate: true`.
- Marca `rescheduled: true` (a visita passa a ser protegida no replanejamento).

### `PUT /visits/{id}/execution`
```json
{ "completedDate": "2026-04-20", "technician": "Nome", "osNumber": "123", "ticketNumber": "",
  "summary": "", "resolution": "", "problems": "", "rev": 4 }
```
`completedDate` nulo desfaz a conclusão. Data de conclusão no futuro → `400 validation`.

### `POST /visits/{id}/notified` · `POST /visits/{id}/notified/undo`
Marcar: `{ "rev": 4 }`. Desfazer: `{ "reason": "obrigatório", "rev": 5 }`.

### `POST /visits/{id}/movidesk-ticket`
Cria o ticket **no servidor**, com o token do SIGA (`MOVIEDESK_TOKEN`). Corpo vazio.
Regras de **idempotência** (nunca duplicar):
1. Se a visita já tem ticket → `200` com ele (`"created": false`).
2. Antes de criar, consulta o Movidesk pela tag `PREVENTIVA-{chave}-{AAAA-MM}`, onde
   `chave` = `legacyId` (se veio da V3) ou `id`, e `AAAA-MM` = mês de **referência**.
   Para visitas importadas, consulta também a tag antiga da V3 (`PREVENTIVA-{legacyId}-{mês agendado}`).
   Achou → grava na visita e devolve (`"created": false`).
3. Senão cria e grava na mesma transação (`201`, `"created": true`).
4. Timeout ou erro do Movidesk → `502 movidesk_error`; grava `movidesk.lastError` e histórico.
   Uma nova tentativa repete a consulta do passo 2, então um ticket criado sem resposta não é duplicado.
```json
{ "ticketId": "4567", "protocol": "4567", "url": "https://...", "created": true, "visit": { ... } }
```
Campos do ticket: os mesmos da V3 (assunto, descrição HTML, `createdBy`, `clients`, tags
`PREVENTIVA` + tag única, equipe/categoria/urgência/serviço configurados no servidor).
O número digitado manualmente pelo técnico em `ticketNumber` **não** é sobrescrito.

### `GET /dashboard?year=2026&month=`
```json
{ "Agendado": 10, "Atrasado": 1, "Não realizado": 2, "Concluído": 30,
  "Concluído antecipado": 3, "Concluído com atraso": 4, "Total": 50 }
```

---

## 6. Extensão automática do cronograma

O servidor mantém, para todo plano ativo, visitas até **dezembro do 5º ano a partir do ano atual**.
Roda uma vez por dia (timer no Node) e na inicialização. Histórico `schedule_extended`.
Datas: a partir da primeira data do plano, somando `n × periodicidade` meses
(sem a "deriva" da V3: 31/01 mensal gera 28/02, **31/03**, 30/04…), depois ajustadas
para o dia útil livre mais próximo da mesma equipe.

---

## 7. Importação da V3 (somente Administrador)

### `POST /import/v3`
Recebe o arquivo gerado por `tools/exportar_v3.py` (a partir do `preventiva.db`).
```json
{ "dryRun": true, "data": { "format": "preventiva-v3-export", "version": 1, "clients": [...], "activities": [...], "history": [...] } }
```
- Associa cada cliente da V3 a um cliente do SIGA pelo nome (sem acento/maiúsculas); sem correspondência → cria.
- Guarda `legacyId` em clientes e visitas (mantém válidas as tags dos tickets já abertos).
- Importa visitas ativas, execução, notificação, ticket Movidesk e histórico (`imported`).
- `dryRun: true` só devolve o relatório, sem gravar. Reimportar um `legacyId` já importado → ignorado.
```json
{ "dryRun": true, "clientsMatched": 40, "clientsCreated": 3, "plansCreated": 43,
  "visitsImported": 900, "historyImported": 2500, "skipped": 0,
  "matches": [ { "legacyId": 7, "name": "Cliente", "sigaClientId": "c_1", "action": "matched" } ] }
```

---

## 8. Tabelas sugeridas no PostgreSQL

Seguindo o padrão do `schema.sql` do SIGA, mas com colunas tipadas para o que é consultado:

```sql
CREATE TABLE IF NOT EXISTS preventive_plans (
  id text PRIMARY KEY,
  client_id text NOT NULL UNIQUE,            -- clients.id
  legacy_id integer UNIQUE,
  period_months smallint NOT NULL CHECK (period_months IN (1,2,3,6)),
  start_month smallint NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  start_year smallint NOT NULL,
  team_id text NOT NULL CHECK (team_id IN ('SP','BR')),
  movidesk_client_id text,
  contacts jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active',     -- active | inactive
  rev bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE TABLE IF NOT EXISTS preventive_dismissed_clients (
  client_id text PRIMARY KEY, reason text NOT NULL, dismissed_by text, dismissed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS preventive_visits (
  id text PRIMARY KEY,
  plan_id text NOT NULL,
  client_id text NOT NULL,
  legacy_id integer UNIQUE,
  team_id text NOT NULL,
  reference_date date NOT NULL,
  original_date date NOT NULL,
  scheduled_date date NOT NULL,
  completed_date date,
  technician text, os_number text, ticket_number text,
  summary text, resolution text, problems text,
  notified_client boolean NOT NULL DEFAULT false,
  override_date boolean NOT NULL DEFAULT false,
  rescheduled boolean NOT NULL DEFAULT false,
  movidesk_ticket_id text, movidesk_protocol text, movidesk_url text,
  movidesk_created_at timestamptz, movidesk_created_by text, movidesk_last_error text,
  active boolean NOT NULL DEFAULT true,
  rev bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE INDEX IF NOT EXISTS preventive_visits_team_date ON preventive_visits (team_id, scheduled_date) WHERE active;
CREATE INDEX IF NOT EXISTS preventive_visits_client ON preventive_visits (client_id, scheduled_date) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS preventive_visits_ticket ON preventive_visits (movidesk_ticket_id) WHERE movidesk_ticket_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS preventive_history (
  id bigserial PRIMARY KEY,
  visit_id text NOT NULL,
  person_id text,
  action text NOT NULL,
  old_date date, new_date date,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preventive_history_visit ON preventive_history (visit_id, created_at);
CREATE TABLE IF NOT EXISTS preventive_holidays (
  date date NOT NULL, name text NOT NULL, team_ids text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (date, name)
);
```

---

## 9. Códigos de erro

| HTTP | `code` | Quando | O que a V4 faz |
|---|---|---|---|
| 400 | `validation` | dados inválidos | mostra a mensagem |
| 401 | `unauthorized` | sem token ou sessão expirada | pede login de novo e repete a operação |
| 403 | `forbidden` | perfil sem acesso | "Seu perfil no SIGA não tem acesso à Agenda de Preventiva" |
| 403 | `password_change_required` | senha provisória | orienta trocar a senha no SIGA |
| 404 | `not_found` | registro não existe | mostra a mensagem e atualiza a tela |
| 409 | `conflict` | `rev` diferente | avisa que outra pessoa alterou e recarrega |
| 409 | `client_exists` | nome já existe no SIGA | pergunta se deve vincular |
| 409 | `plan_exists` | cliente já tem cronograma | mostra a mensagem |
| 422 | `date_restricted` | data restrita sem `override` | oferece a data sugerida ou manter com confirmação |
| 429 | `rate_limited` | excesso de requisições | aguarda e tenta de novo |
| 502 | `movidesk_error` | falha no Movidesk | mostra a mensagem; pode tentar de novo sem duplicar |
| 5xx / rede | — | servidor fora | tela **"Servidor indisponível"** |

---

## 10. Menu web/mobile (Gestão › Agenda de Preventiva)

- Visível só para **Service Desk** e **Administrador** (incluir a página em `profilePages` desses perfis em
  `src/access.ts`; **não** incluir no perfil Técnico nem em `mobilePages` do Técnico).
- Telas: **Calendário** (mês, indicação SP/BR), **Cronograma** (por cliente e ano),
  **Reagendar** (mesmas regras da seção 5, motivo obrigatório) e o aviso de **clientes pendentes**.
- Usa somente as rotas deste documento (nada no `/api/state`).
