# Cladindin

Sistema web de gestão financeira para pessoa física e pequena empresa: contas a pagar e a receber, fluxo de caixa, contas bancárias, cartões, importação de OFX/CSV e lançamentos recorrentes. Feito com Next.js, Supabase e Tailwind.

## Status

- [x] **Fase 1**: auth (senha e link mágico), workspaces, membros, convites, RLS, auditoria, layout base, tema claro/escuro
- [x] **Fase 2**: contas, cartões, categorias (semente PF/PJ), contatos, lançamentos com filtros e ações em massa, transferências, exportação CSV, dashboard
- [x] **Fase 3**: importador OFX (conta e cartão), deduplicação, conciliação, desfazer
- [x] **Fase 4**: faturas de cartão (OFX, CSV com mapeador e modelos, PDF), parcelamentos, estornos, pagamento de fatura
- [x] **Fase 5**: recorrências (feriados, dia útil, editar esta/próximas/todas, pausar), job diário, sugestões de recorrência, contas a pagar/receber com baixa parcial, juros, multa, desconto e comprovantes
- [x] **Fase 6**: regras de categorização (aplicadas na importação, reaplicar, criar a partir do lançamento), relatórios (fluxo, categorias/contatos/centros, comparativo, DRE, saldo) com CSV e impressão/PDF
- [ ] Fase 7: polimento, metas, e2e, deploy

## Rodando localmente

Requisitos: Node 20+ e pnpm.

```bash
pnpm install
cp .env.example .env.local   # preencha URL e chave anon do Supabase
pnpm dev
```

### Banco de dados

As migrations ficam em `supabase/migrations`. Para aplicar, use uma das opções:

- **Supabase CLI:** `supabase link --project-ref <ref>` e depois `supabase db push`
- **SQL Editor** do painel: cole os arquivos em ordem

No painel do Supabase, em **Authentication > URL Configuration**, adicione `http://localhost:3000/auth/callback` (e a URL de produção) às Redirect URLs.

### Testes

```bash
pnpm lint && pnpm typecheck && pnpm test
```

O teste de isolamento por RLS está em `supabase/tests/rls_isolamento.sql` e roda com `supabase test db`.

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon ou publishable (pública; a segurança vem do RLS) |
| `NEXT_PUBLIC_SITE_URL` | URL base usada nos links de convite |

Nenhuma chave `service_role` é usada pelo app.

## Deploy

Vercel: importe o repositório, configure as variáveis acima e adicione a URL de produção nas Redirect URLs do Supabase.

Mais detalhes em [docs/arquitetura.md](docs/arquitetura.md).

## Job diário de recorrências (opcional)

As telas já completam os próximos 12 meses de previstos quando são abertas. Para manter isso mesmo sem ninguém acessar, há um cron diário na Vercel (`vercel.json`) que chama `/api/cron/recorrencias`. Ele precisa de duas variáveis, configuradas **só na Vercel** e nunca com prefixo `NEXT_PUBLIC_`:

- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta do Supabase (Project Settings → API Keys → Secret keys)
- `CRON_SECRET`: um texto aleatório longo

Sem elas, o cron responde 401/500 e nada é alterado.
