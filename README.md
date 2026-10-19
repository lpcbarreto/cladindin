# Cladindin

Sistema web de gestão financeira para pessoa física e pequena empresa: contas a pagar e a receber, fluxo de caixa, contas bancárias, cartões, importação de OFX/CSV e lançamentos recorrentes. Feito com Next.js, Supabase e Tailwind.

## Status

- [x] **Fase 1**: auth (senha e link mágico), workspaces, membros, convites, RLS, auditoria, layout base, tema claro/escuro
- [ ] Fase 2: contas, categorias, contatos, lançamentos, transferências, dashboard
- [ ] Fase 3: importador OFX, deduplicação, conciliação
- [ ] Fase 4: faturas de cartão (CSV, mapeador, PDF), parcelamentos
- [ ] Fase 5: recorrências, job agendado, baixas
- [ ] Fase 6: regras de categorização, relatórios, exportações
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
