# Agenda de Preventiva — integração no servidor do SIGA

Este pacote contém **todo** o código do módulo para o SIGA. O app instalado (Preventiva V4) já está pronto
e fala com estas rotas. No servidor resta **copiar, ligar e configurar** — não é preciso escrever regra nova.

Contrato da API: `../docs/ESQUEMA_API_PREVENTIVAS.md`.
Validado em 13/11/2026 com Node 22 + PostgreSQL 16: os 23 testes de contrato da V4 passam contra este módulo
(o mesmo resultado do servidor de referência), inclusive importação da V3 e Movidesk sem duplicidade.

## Conteúdo

| Arquivo | Vai para (no SIGA, pasta `gio`) | O que é |
|---|---|---|
| `server/preventives/index.mjs` | `server/preventives/` | Entrada do módulo: rotas `/api/v1/preventives/*`, perfis, limite de requisições, extensão diária |
| `server/preventives/repository.mjs` | `server/preventives/` | Regras e SQL (cronograma, replanejamento, reagendamento, Movidesk, importação V3) |
| `server/preventives/scheduler.mjs` | `server/preventives/` | Regras de datas (feriados, dia útil, status) — idênticas às do app |
| `server/preventives/movidesk.mjs` | `server/preventives/` | Ticket no Movidesk com busca por tag antes de criar |
| `server/preventives/siga-adapter.mjs` | `server/preventives/` | **Único** arquivo que toca tabelas existentes (people, clients, gio_meta, change_log) |
| `server/preventives/schema.sql` | `server/preventives/` | Tabelas novas `preventive_*` (criadas sozinhas na inicialização) |
| `src/preventives/*` | `src/preventives/` | Menu **Gestão › Agenda de Preventiva** (React/TS) |
| `dev/*`, `package.json`, `tsconfig.json` | **não copiar** | Ambiente de teste (harness + Movidesk falso) |

Nenhuma dependência nova: o servidor usa o `pg` que o SIGA já tem; o menu usa o React que o SIGA já tem.

## 0. Antes de começar (obrigatório)

1. **Backup do banco** pelo Painel GIO ("Fazer backup do banco agora") e confirmar que o arquivo `.dump` existe em `.gio-data\backups`.
2. **Enviar as mudanças pendentes ao GitHub** (`Enviar GIO para o GitHub.cmd`), para ter um ponto de volta.
3. Recomendado: **homologação** (outra porta + outro banco) para ligar o módulo primeiro lá.
4. Recomendado: ligar o **início automático do SIGA** no Painel (o app mostra "servidor indisponível" enquanto o Node estiver parado).

## 1. Copiar os arquivos

Copiar `server/preventives/` e `src/preventives/` deste pacote para as mesmas pastas dentro de `gio`.

## 2. Ligar as rotas — `server/local-server.mjs`

```js
// no topo, junto dos outros imports
import { createPreventivesModule } from './preventives/index.mjs';

// depois de criar o pool/repositório do PostgreSQL (onde o SIGA já tem `pool`)
const preventives = createPreventivesModule({ pool, sendJson, readJsonBody });
await preventives.start();   // cria as tabelas preventive_* e estende os cronogramas (1x/dia)

// dentro do createServer: DEPOIS da verificação de sessão (linha ~72) e
// DEPOIS do bloqueio de senha provisória (linha ~79), ANTES do 404 (linha ~94)
if (url.pathname.startsWith('/api/v1/preventives')) {
  return await preventives.handle(request, response, session, url);
}
```

Se o `pool` não estiver acessível no `local-server.mjs`, exporte-o de `server/db/postgres.mjs` (por exemplo,
devolvendo-o no objeto do `createRepository`) ou crie o módulo dentro de `postgres.mjs` e exporte `preventives`.

## 3. Conferir o adaptador — `server/preventives/siga-adapter.mjs`

Procurar `>>> CONFERIR` e comparar com `server/db/postgres.mjs`:

| Ponto | O que conferir |
|---|---|
| `personIdFromSession` | Nome do campo com o id da pessoa no objeto `session` que o SIGA passa às rotas |
| `getPerson` | Colunas `name`, `email`, `groups`, `must_change_password`, `deleted_at` de `people` |
| `nextRevision` | Como o SIGA incrementa `gio_meta.revision` (formato do valor jsonb) |
| `createSigaClient` | Formato do `id` e campos obrigatórios do `data` de um cliente (comparar com um cliente criado pela tela de cadastro) |
| `listSigaClients` | Colunas geradas `name`, `city`, `state`, `active` e `deleted_at` de `clients` |

Os nomes de perfil usados são exatamente **`Service Desk`** e **`Administrador`** (`ALLOWED_PROFILES`).

## 4. Configurar — `.env.server`

O módulo reaproveita `MOVIEDESK_TOKEN` e `MOVIEDESK_API_BASE` que já existem. Acrescentar:

```ini
# código de referência (no Movidesk) da pessoa/agente que abre os tickets de preventiva — obrigatório para tickets
PREVENTIVA_MOVIDESK_CREATED_BY=
# opcionais (mesmos campos que a V3 tinha em "Configurar Movidesk")
PREVENTIVA_MOVIDESK_OWNER_TEAM=
PREVENTIVA_MOVIDESK_CATEGORY=
PREVENTIVA_MOVIDESK_URGENCY=
PREVENTIVA_MOVIDESK_SERVICE_ID=
PREVENTIVA_MOVIDESK_TICKET_TYPE=2
PREVENTIVA_MOVIDESK_TICKET_URL=https://app.movidesk.com/Account#/tickets/{id}
# versão mínima do app instalado aceita pelo servidor
PREVENTIVA_MIN_DESKTOP_VERSION=4.0.0
```

> Ponto para validar em homologação: a busca de ticket por tag usa `$filter=tags/any(t: t eq 'TAG')`
> (função `findTicketByTag` em `movidesk.mjs`). Abrir um ticket de teste e conferir que uma segunda tentativa
> responde "já existia".

## 5. Menu web — Gestão › Agenda de Preventiva

1. `src/access.ts`: acrescentar o id `'preventiveSchedule'` ao tipo `Page` e aos `profilePages` de **Service Desk**
   (Administrador já vê tudo). **Não** incluir no perfil Técnico.
2. `src/App.tsx`: incluir o item no array do grupo **Gestão** (`managementPages`) com o rótulo `Agenda de Preventiva`
   (ícone sugerido: `CalendarClock` do lucide-react) e renderizar no `pageBody`:

   ```tsx
   import PreventivesModule from './preventives/PreventivesModule';
   // ...
   {page === 'preventiveSchedule' && (
     <PreventivesModule getToken={() => /* mesmo token usado em src/serverApi.ts */} compact={variant === 'mobile'} />
   )}
   ```
   O `getToken` deve devolver o token da sessão que `src/serverApi.ts` guarda no `sessionStorage`.
3. Mobile: incluir `'preventiveSchedule'` em `mobilePages` só para Service Desk/Administrador (aparece no app Android sem novo APK).
4. As classes CSS do módulo começam com `pv-` e usam as variáveis `--brand`/`--green` do `styles.css`.

## 6. Clientes novos no SIGA (pendentes)

Já funciona sem mudar nada: todo cliente do SIGA sem cronograma aparece como pendente no app (aviso 🔔) e no menu web.
Opcional: no ponto do `postgres.mjs` onde um cliente novo é gravado, criar uma `notification` para as pessoas com perfil
Service Desk/Administrador: *"Cliente X cadastrado. Deseja criar o cronograma de preventivas?"*.

## 7. Reiniciar e conferir

1. Painel GIO › **Reiniciar** (recompila o frontend porque há fonte nova).
2. Conferir no log `.logs\gio-server.log` que não há erro; as tabelas `preventive_*` passam a existir.
3. `GET https://siga.alertsystem.com.br/api/health` continua `online`.
4. No app V4 (Configurações › endereço do servidor = homologação ou produção): entrar como Service Desk, criar um cliente de teste,
   reagendar uma preventiva, abrir um ticket Movidesk e tentar de novo (deve dizer que já existia).
5. Entrar como Técnico: o app e o menu devem negar o acesso.
6. Importar a V3: no app, Arquivo › Importar dados da V3 (Administrador), escolher o `preventiva.db`, conferir a simulação e confirmar.

## Testar este pacote fora do SIGA (opcional)

Com Node 22+, Python 3.12+ e um PostgreSQL vazio de teste (nunca o banco `gio`):

```powershell
cd siga_modulo_preventivas
npm install
$env:DATABASE_URL = "postgres://usuario:senha@127.0.0.1:5432/preventivas_teste"
node dev/harness.mjs --port 8787
# em outro terminal, na pasta preventiva:
$env:PREVENTIVA_CONTRACT_URL = "http://127.0.0.1:8787"
python -m pytest tests_v4/test_contract.py
```
O harness **apaga e recria** as tabelas do banco indicado a cada teste.
