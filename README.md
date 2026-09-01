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
