# Prompt para o Claude do servidor (integração da Agenda de Preventiva)

Copie a pasta `siga_modulo_preventivas` e o arquivo `docs/ESQUEMA_API_PREVENTIVAS.md` para o servidor
(ex.: `C:\Users\Administrador\Desktop\pacote_preventivas\`) e cole o texto abaixo no Claude do servidor,
ajustando o caminho do pacote se for outro.

---

```
Você vai integrar o módulo "Agenda de Preventiva" no SIGA, que fica em C:\Users\Administrador\Desktop\gio
(Node 24 com node:http puro, PostgreSQL 18 via 'pg', frontend React 19 + TypeScript + Vite).

O código do módulo já está pronto e testado em C:\Users\Administrador\Desktop\pacote_preventivas\siga_modulo_preventivas.
Leia primeiro, por inteiro: INTEGRACAO.md, server/preventives/*.mjs, src/preventives/* e ESQUEMA_API_PREVENTIVAS.md.
Siga o INTEGRACAO.md. Não reescreva as regras do módulo: só copie, ligue e adapte o que estiver marcado ">>> CONFERIR".

REGRAS
- Antes de alterar qualquer arquivo do SIGA, confirme comigo que existe um backup do banco feito hoje (Painel GIO) e que as
  mudanças pendentes foram enviadas ao GitHub. Se não tiver como confirmar, pare e me pergunte.
- Não apague nem renomeie tabelas, colunas ou arquivos existentes. Não altere o /api/state. Não mexa em senhas, tokens nem no .env.server
  além de ACRESCENTAR as variáveis PREVENTIVA_* (deixe PREVENTIVA_MOVIDESK_CREATED_BY vazio e me peça o valor).
- Não exiba segredos nem dados de clientes nas respostas.
- Faça uma mudança por vez e mostre o diff de cada arquivo do SIGA alterado.

PASSOS
1. Ler server/local-server.mjs, server/db/postgres.mjs, src/serverApi.ts, src/access.ts, src/App.tsx e src/mobile/MobileShell.tsx
   e me dizer, com linha e arquivo:
   a) onde está o `pool` do PostgreSQL e como torná-lo acessível ao local-server.mjs;
   b) o formato do objeto `session` entregue às rotas (campo com o id da pessoa);
   c) como a revisão global (gio_meta.revision) é incrementada e como um cliente novo é gravado (id e campos do jsonb `data`);
   d) os nomes exatos dos perfis Service Desk e Administrador;
   e) a função/variável que guarda o token da sessão no navegador.
2. Comparar essas respostas com server/preventives/siga-adapter.mjs e ajustar SOMENTE esse arquivo onde for diferente.
3. Copiar server/preventives/ e src/preventives/ do pacote para gio/server/preventives/ e gio/src/preventives/.
4. Ligar o módulo no server/local-server.mjs como no passo 2 do INTEGRACAO.md (import, createPreventivesModule, start,
   encaminhamento de /api/v1/preventives depois da sessão e da checagem de senha provisória, antes do 404).
5. Acrescentar as variáveis PREVENTIVA_* ao .env.server (valores vazios, exceto TICKET_TYPE=2, TICKET_URL e MIN_DESKTOP_VERSION=4.0.0).
6. Menu: adicionar a página 'preventiveSchedule' ("Agenda de Preventiva") no grupo Gestão, visível só para Service Desk e
   Administrador (access.ts, App.tsx, mobilePages), renderizando <PreventivesModule getToken={...} compact={variant === 'mobile'} />.
7. Me pedir para reiniciar pelo Painel GIO. Depois, conferir no .logs\gio-server.log que o servidor subiu sem erro e que
   GET /api/health continua online.
8. Me passar um roteiro curto de conferência: login no app V4, criar cliente de teste, reagendar, ticket Movidesk duas vezes
   (a segunda deve dizer que já existia), acesso negado para Técnico, menu Gestão › Agenda de Preventiva no site e no celular.

No final, liste os arquivos alterados do SIGA, o que foi adaptado no siga-adapter.mjs e qualquer ponto que ficou pendente.
```
