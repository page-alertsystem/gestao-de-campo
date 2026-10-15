# GIO — Gestão Integrada de Operações

Aplicação web para gerenciamento das operações de campo, estoque, auditorias e manutenção/RMA.

## Executar localmente

```bash
pnpm install
pnpm dev
```

## Compilar

```bash
pnpm build
```

## Banco de dados (PostgreSQL)

O servidor guarda os dados no PostgreSQL, com uma tabela por tipo de registro (pessoas, estoque, pedidos, RMA, auditorias etc.), PDFs dentro do banco, sessões persistentes e histórico de alterações (`change_log`). As permissões de cada perfil são verificadas no servidor.

- Instalação nesta máquina: execute `scripts\instalar-postgres.ps1` (instala o PostgreSQL, cria o banco `gio`, grava `DATABASE_URL` no `.env.server`, importa o banco antigo SQLite, recompila e reinicia o GIO).
- Estrutura: `server/db/schema.sql`. Acesso aos dados: `server/db/postgres.mjs`.
- Importação manual de um `.gio-data` antigo: `node scripts/migrar-sqlite-para-postgres.mjs C:\caminho\.gio-data`.
- Requisito: Node.js 22.13 ou superior.

## Servidor local desta máquina

O servidor local hospeda o GIO para a rede interna e protege o token usado na comunicação com o Movidesk.

1. Execute `Iniciar servidor GIO.cmd`.
2. Nesta máquina, acesse `http://127.0.0.1:4173/`.
3. Nos celulares ou computadores conectados à mesma rede, acesse `http://IP-DA-MAQUINA:4173/`.

Para desligar, execute `Parar servidor GIO.cmd`.

### Configuração do Movidesk

Na primeira inicialização será criado o arquivo `.env.server`, que não entra no Git. Preencha nele:

- `MOVIEDESK_TOKEN`: token da API;
- `MOVIEDESK_REQUESTER_ID`: código de uma pessoa de integração cadastrada no Movidesk;
- os campos opcionais de serviço e responsável pela equipe de RMA, quando necessários.

O token nunca deve ser colocado em arquivos dentro de `src` ou em variáveis iniciadas por `VITE_`, pois essas informações seriam enviadas ao navegador.
