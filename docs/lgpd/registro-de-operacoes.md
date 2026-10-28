# Registro das operações de tratamento de dados pessoais (LGPD, art. 37)

**Controlador:** ver `lib/legal.ts` (razão social, CNPJ, endereço) · **Encarregado:** ver `lib/legal.ts`
**Atualizado em:** 28/10/2026 — revise sempre que o sistema passar a coletar um dado novo ou contratar um fornecedor novo.

Documento interno. Descreve o que o sistema realmente faz (código em `app/`, `lib/` e `supabase/migrations/`).

## 1. Operações

| # | Operação | Titulares | Dados | Finalidade | Base legal | Onde fica | Retenção |
|---|---|---|---|---|---|---|---|
| 1 | Cadastro e login | Usuários | E-mail, senha (hash), nome opcional, fator 2FA, aceite dos termos (versão e data) | Criar e proteger a conta | Execução de contrato (art. 7º, V) | Supabase Auth, tabela `profiles` | Enquanto a conta existir |
| 2 | Organização financeira | Usuários | Contas, lançamentos, categorias, metas, orçamentos, recorrências, faturas | Prestar o serviço | Execução de contrato (art. 7º, V) | Tabelas do workspace (Supabase) | Enquanto o workspace existir |
| 3 | Contatos de clientes/fornecedores | Terceiros cadastrados pelo usuário | Nome, CPF/CNPJ, e-mail, telefone (opcionais) | Organizar lançamentos e relatório de IR | Do usuário/empresa controladora; o Cladindin é operador | Tabela `contacts` | Enquanto o workspace existir |
| 4 | Comprovantes | Usuários e terceiros nos documentos | Arquivos PDF/imagem | Guardar comprovantes dos lançamentos | Execução de contrato | Supabase Storage (bucket privado `comprovantes`) | Enquanto o lançamento/workspace existir |
| 5 | Importação de extratos | Usuários e terceiros nos extratos | Linhas do extrato (data, descrição, valor); o arquivo não é guardado, só nome e código de verificação (hash) | Lançar automaticamente | Execução de contrato | Tabelas `transactions`, `import_batches` | Enquanto o workspace existir |
| 6 | Consulta de CNPJ | Empresas (pessoa jurídica) | Número de CNPJ | Sugerir categoria e cadastrar contato | Legítimo interesse / execução de contrato | Enviado à BrasilAPI; resposta em cache por 30 dias | 30 dias (cache) |
| 7 | Registros de acesso | Usuários | Data, hora e IP de cada login | Guarda obrigatória e segurança | Obrigação legal (art. 7º, II; Marco Civil art. 15) | Tabela `access_log` | 6 meses (apagados pelo job diário) |
| 8 | Histórico de alterações | Usuários | Quem alterou qual registro e quando | Auditoria do workspace | Legítimo interesse (art. 7º, IX) | Tabela `audit_log` | Enquanto o workspace existir |
| 9 | Avisos por e-mail | Usuários | E-mail, lançamentos a vencer, totais | Lembrar vencimentos e resumo semanal | Execução de contrato (pode ser desligado) | Resend (envio), `notification_log` | Registro de envio enquanto a conta existir |
| 10 | Pedidos de titulares | Qualquer pessoa | Nome, e-mail, tipo e texto do pedido | Atender direitos do art. 18 | Obrigação legal (art. 7º, II) | Tabela `privacy_requests` | Tempo necessário para comprovar o atendimento |
| 11 | Limite de tentativas | Usuários | ID do usuário + nome da ação; IP só em memória | Segurança contra abuso | Legítimo interesse (art. 7º, IX) | Tabela `rate_limit_hits` | 1 dia |
| 12 | Registro de erros | Usuários | Tipo e mensagem do erro, caminho da página (IDs trocados por `:id`) | Corrigir falhas | Legítimo interesse | Logs da Vercel | Retenção padrão da Vercel |

## 2. Operadores (suboperadores)

| Fornecedor | Função | País | Dados |
|---|---|---|---|
| Supabase | Banco, autenticação, arquivos | EUA (us-east-1) | Todos os acima |
| Vercel | Hospedagem e logs | EUA | Requisições e logs de erro |
| Resend | Envio de e-mails de aviso | EUA | E-mail e conteúdo dos avisos |
| BrasilAPI | Consulta pública de CNPJ | Brasil | Só números de CNPJ |
| Have I Been Pwned | Checagem de senha vazada | Global | 5 caracteres de um hash (não identificável) |

**Pendência do controlador:** aceitar os acordos de tratamento de dados (DPA) de Supabase, Vercel e Resend nos painéis de cada um e arquivar a confirmação.

## 3. Transferência internacional (art. 33)

Supabase, Vercel e Resend: EUA. Fundamento: execução de contrato com o titular e garantias contratuais dos fornecedores (DPA). Informado na Política de Privacidade, item 4.

## 4. Medidas de segurança

RLS em todas as tabelas (isolamento por workspace, também no banco); HTTPS; senhas com hash; 2FA opcional exigido também no banco; cookies de sessão httpOnly/Secure/SameSite; CSP e cabeçalhos de segurança; limite de tentativas; recusa de senhas vazadas; chave secreta só no servidor; dependências auditadas (`pnpm audit`).

## 5. Direitos dos titulares

Autoatendimento em Configurações › Seus dados (exportar conta, exportar workspace, corrigir nome, excluir conta). Demais pedidos: formulário `/lgpd` (tabela `privacy_requests`) ou e-mail do Encarregado. Prazo: 15 dias.
