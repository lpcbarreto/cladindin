# Arquitetura

## Visão geral

- **Next.js App Router.** Server Components leem dados com o cliente Supabase do usuário (sessão em cookie). Mutations rodam em **Server Actions** validadas com **Zod**. Funções que precisam ser atômicas ficam no Postgres (RPC).
- **Supabase**: Postgres, Auth e Storage. **Toda autorização é feita por RLS.** O app usa só a chave publishable e a sessão do usuário. A chave secreta é usada exclusivamente pelo job diário (`/api/cron/recorrencias`).
- `middleware.ts` renova a sessão e manda quem não está logado para `/login`.
- **Regras financeiras puras** ficam em `lib/finance` e `lib/importers` e são testadas com Vitest, sem banco.

## Multiusuário e segurança

- `workspaces` → `workspace_members (role: owner > admin > editor > viewer)`.
- `is_member(ws, min_role)` (security definer) é usada em **todas** as policies: leitura para qualquer membro, escrita a partir de editor.
- O trigger `check_same_workspace` impede que um lançamento aponte para conta, categoria ou contato de outro workspace.
- Inserções em workspaces e membros acontecem só por funções controladas (`handle_new_user`, `create_workspace`, `accept_invite`).
- `audit_log` registra o antes e o depois de lançamentos, contas, membros e regras, com `auth.uid()`.
- Comprovantes ficam no bucket privado `comprovantes/<workspace>/<lançamento>/<arquivo>`, com policies pelo primeiro segmento do caminho. O tipo é validado pelo conteúdo (assinatura do arquivo) e os links para baixar são temporários (5 min).
- Rate limit nas rotas de importação, CSV exportado protegido contra injeção de fórmulas, logs sem dados financeiros.

## Modelo de dados (resumo)

| Tabela | Papel |
| --- | --- |
| `accounts`, `credit_cards` | Contas e configuração do cartão (fechamento, vencimento, limite, conta de pagamento) |
| `categories` (pai/filha), `contacts`, `tags`, `cost_centers` | Cadastros |
| `transactions` | Lançamentos. `amount_cents` sempre positivo e `direction` ±1. Status `planned/paid/cancelled`. Soft delete. Origem `manual/import/recurrence/installment`. FITID, fingerprint, parcelas, fatura, recorrência, juros/multa/desconto |
| `invoices` + view `invoice_summaries` | Faturas de cartão e o total calculado pelas linhas |
| `import_batches`, `account_import_links`, `import_templates` | Histórico, vínculo BANKID/ACCTID → conta, modelos de CSV |
| `recurrence_rules` | Regras de recorrência. Ocorrências únicas por `(recurrence_id, recurrence_date, direction)` |
| `categorization_rules` | Regras automáticas |
| `budgets` | Orçamento por categoria principal (padrão ou por mês) |
| `attachments` | Metadados dos comprovantes |

## Convenções financeiras

- Dinheiro em **centavos (`bigint`)**, nunca float. Datas financeiras como `date`, no fuso `America/Sao_Paulo`.
- **Transferência** = par de lançamentos ligados por `transfer_group_id`. Fica fora de receitas e despesas.
- **Cartão:** compras são despesas na conta do cartão e entram na fatura certa (trigger `assign_invoice`). **Pagar a fatura** é uma transferência conta → cartão. **Estorno** é despesa com `direction = +1`, ou seja, reduz o gasto.
- **Competência × caixa:** competência usa `competence_date` (data da compra). Caixa usa `paid_date` (realizado) ou `due_date` (previsto).
- "Atrasado" é derivado: previsto com vencimento no passado.

## Fluxos principais

- **Importação:** arquivo → `loadBankFile` (OFX, CSV ou PDF) → fingerprint → `classifyRows` (já importado, conciliar, duplicado, novo) → revisão → `commit_import` (atômico, idempotente) → regras de categorização. Detalhes em [importadores.md](importadores.md).
- **Recorrência:** `occurrences()` gera as datas (feriados, dia útil, término) → `generateRule` grava os previstos com upsert idempotente. A janela é completada ao abrir as telas e pelo cron diário.
- **Baixa:** `settle_transaction` marca como pago, registra juros, multa e desconto e cria o saldo restante quando o pagamento é parcial.

## Estrutura

```
app/login, app/auth/*, app/convite/[token]    acesso
app/(app)/w/[workspaceId]/
  dashboard  lancamentos  a-pagar  recorrencias  importar  importacoes
  cartoes  contas  relatorios  orcamento  categorias  regras  contatos  configuracoes
app/api/cron/recorrencias                     job diário (Vercel Cron)
components/                                   logo, menu, tema, gráficos
lib/finance/                                  dinheiro, datas, parcelas, recorrência, feriados, regras, relatórios, orçamento
lib/importers/                                OFX, CSV, PDF, normalização, conciliação
lib/*-server.ts                               acesso a dados no servidor
supabase/migrations                           schema versionado (fases 1–7)
supabase/tests                                RLS (pgTAP)
tests/e2e                                     Playwright
fixtures/                                     arquivos sintéticos de teste
```
