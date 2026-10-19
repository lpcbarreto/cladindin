# Cladindin

Sistema web de gestão financeira para **pessoa física e pequena empresa**, em português do Brasil. Controla contas a pagar e a receber, fluxo de caixa, contas bancárias e cartões de crédito, com importação de extratos e faturas.

**No ar:** https://cladindin.vercel.app

## O que ele faz

| Área | Recursos |
| --- | --- |
| **Acesso** | Login com senha ou link mágico. Workspaces separados (ex.: Pessoal e Empresa). Membros com papéis (proprietário, admin, editor, leitor), convites por link com validade. Isolamento total por RLS. Auditoria de alterações. |
| **Cadastros** | Contas (corrente, poupança, carteira, investimento, cartão). Categorias hierárquicas já semeadas para PF e PJ. Clientes e fornecedores com CPF/CNPJ validado. |
| **Lançamentos** | Receitas, despesas e transferências (que não contam como receita nem despesa). Filtros, ações em massa, exportação CSV, parcelamento, comprovantes. |
| **Importação** | OFX 1.x/2.x (conta e cartão, UTF-8 e Windows-1252, arquivos malformados). CSV com layouts de emissores e mapeador de colunas com modelos salvos. Fatura em PDF (melhor esforço). Deduplicação por FITID e fingerprint, conciliação com previstos, conferência de saldo, desfazer. |
| **Cartões** | Faturas por fechamento e vencimento. Parcelas detectadas e projetadas nas faturas seguintes. Estornos, IOF e encargos. "Pagar fatura" como transferência, sem contar duas vezes. Limite usado. |
| **Recorrências** | Diária a anual, dia fixo, último dia ou N-ésimo dia útil, feriados nacionais, término por data ou quantidade, valor variável. Editar "todas" ou "a partir de". Pausar e encerrar. Job diário. Sugestões automáticas de recorrência. |
| **A pagar/receber** | Agrupado por vencimento. Baixa em massa, ou individual com pagamento parcial, juros, multa, desconto e comprovante. |
| **Regras** | Categorização automática (contém, começa com, igual, regex, valor, sentido, conta), aplicada na importação. Reaplicar e "criar regra para parecidos". |
| **Relatórios** | Fluxo de caixa (realizado × previsto), por categoria, contato ou centro de custo, comparativo mês a mês, DRE simplificado, evolução do saldo. Regime de competência ou caixa. CSV e impressão/PDF. |
| **Orçamento** | Limite mensal por categoria (padrão ou só de um mês), com alertas no dashboard. |
| **Privacidade (LGPD)** | Exportação completa do workspace em JSON e exclusão definitiva pelo proprietário. |

## Stack

Next.js 15 (App Router, TypeScript strict), Supabase (Postgres, Auth, Storage, RLS), Tailwind CSS 4, Zod, Recharts, Vitest, Playwright e pnpm. Deploy na Vercel.

## Rodando localmente

Requisitos: Node 20+ e pnpm.

```bash
pnpm install
cp .env.example .env.local   # preencha a URL e a chave publishable do Supabase
pnpm dev                     # http://localhost:3000
```

### Banco de dados

- **Banco novo:** cole `supabase/setup-completo.sql` no **SQL Editor** e rode.
- **Banco existente:** aplique em ordem as migrations de `supabase/migrations` que ainda faltam, ou use `supabase db push`.

No Supabase, em **Authentication → URL Configuration**:
- **Site URL:** a URL do app
- **Redirect URLs:** `http://localhost:3000/auth/callback` e `https://SEU-DOMINIO/auth/callback`

Para conhecer o sistema, abra **Configurações → Dados de demonstração** num workspace vazio.

## Variáveis de ambiente

| Variável | Onde | Descrição |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | todas | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | todas | Chave **publishable** (pública; a segurança vem do RLS) |
| `NEXT_PUBLIC_SITE_URL` | todas | URL base usada nos links de convite |
| `SUPABASE_SERVICE_ROLE_KEY` | só servidor (Vercel) | Chave secreta, usada **apenas** pelo job diário de recorrências |
| `CRON_SECRET` | só servidor (Vercel) | Protege a rota do job diário |

O app em si nunca usa a chave secreta. As duas últimas variáveis são opcionais: sem elas, as telas completam os previstos quando são abertas.

## Testes

```bash
pnpm lint && pnpm typecheck
pnpm test        # Vitest: parsers OFX/CSV/PDF, deduplicação, parcelas, recorrência, feriados, regras, relatórios, orçamento
pnpm e2e         # Playwright: fluxos públicos; o fluxo importar → deduplicar → dashboard → desfazer
                 # roda com E2E_EMAIL e E2E_PASSWORD de um usuário de TESTE
```

O isolamento por RLS é provado em `supabase/tests/rls_isolamento.sql`. Rode com `supabase test db` ou cole no SQL Editor de um banco **de desenvolvimento**: tudo é desfeito no final.

As fixtures em `fixtures/` são **sintéticas**: nomes e valores fictícios, sem nenhum dado bancário real.

## Deploy (Vercel)

1. Importe o repositório na Vercel e cadastre as variáveis acima.
2. Configure as Redirect URLs no Supabase com o domínio da Vercel.
3. Cada push na `main` publica sozinho. O job diário está em `vercel.json` e roda às 06:00 (Brasília).

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md): modelo de dados, segurança, regras financeiras, estrutura
- [docs/importadores.md](docs/importadores.md): como funcionam e como adicionar um emissor ou formato

## Próximos passos sugeridos

- Envio automático do e-mail de convite (hoje o link é copiado na tela)
- Open Finance como novo "provedor" de extratos (a interface dos importadores já comporta)
- Edição inline e virtualização da tabela de lançamentos para volumes muito grandes
