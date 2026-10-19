# Arquitetura

## Visão geral

- **Next.js App Router**: Server Components leem dados com o cliente Supabase do usuário (cookie de sessão). Mutations rodam em Server Actions validadas com Zod.
- **Supabase**: Postgres, Auth e Storage. **Toda autorização é feita por RLS**: o app nunca usa `service_role`.
- `middleware.ts` renova a sessão e redireciona para `/login` quem não está autenticado.

## Multiusuário

- `workspaces`: cada um é um "livro" financeiro independente (PF ou PJ).
- `workspace_members (workspace_id, user_id, role)`: os papéis são `owner > admin > editor > viewer`.
- `is_member(ws, min_role)`: função `security definer` usada em todas as policies. Toda tabela de domínio terá `workspace_id` e policies do tipo `using (is_member(workspace_id))` para leitura e `is_member(workspace_id, 'editor')` para escrita.
- Inserções em `workspaces` e `workspace_members` acontecem **somente** por funções controladas:
  - `handle_new_user`: trigger no cadastro que cria o workspace "Pessoal"
  - `create_workspace`
  - `accept_invite`
- **Convites**: token aleatório de 48 caracteres hexadecimais, válido por 7 dias, que só pode ser aceito pelo e-mail convidado. Por enquanto o link é copiado na tela. O envio automático por e-mail (Resend ou SMTP do Supabase) fica para uma fase posterior.

## Auditoria

`audit_trigger()` grava em `audit_log` o antes e o depois de cada insert, update e delete, junto com `auth.uid()`. Ele será anexado a `transactions` e às demais tabelas de domínio.

## Convenções financeiras

- Dinheiro em **centavos (`bigint`)**. Veja `lib/finance/money.ts`.
- Datas financeiras como `date`, no fuso `America/Sao_Paulo`.
- Lançamentos usarão soft delete (`deleted_at`).

## Estrutura

```
app/login, app/auth/*         autenticação
app/convite/[token]           aceite de convite
app/(app)/w/[workspaceId]/*   área logada, por workspace
lib/supabase                  clientes server/browser
lib/finance                   regras financeiras puras (testadas com Vitest)
lib/importers                 (Fase 3+) OFX, CSV, PDF, adaptadores por emissor
supabase/migrations           schema versionado
supabase/tests                testes de RLS (pgTAP)
```
