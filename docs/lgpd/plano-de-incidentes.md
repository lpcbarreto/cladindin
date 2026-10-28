# Plano de resposta a incidentes de segurança com dados pessoais

Base: LGPD art. 48 e Resolução CD/ANPD nº 15/2024 (Regulamento de Comunicação de Incidente de Segurança).
Responsável: Encarregado (ver `lib/legal.ts`).

## 1. O que é um incidente

Qualquer acesso não autorizado, vazamento, perda, alteração ou destruição de dados pessoais. Exemplos: chave secreta do Supabase exposta, conta de administrador invadida, comprovantes acessíveis por quem não deveria, banco apagado por engano.

## 2. Primeira hora — conter

1. **Trocar as chaves:** no Supabase, gerar nova `service_role`/secret key e revogar a antiga; atualizar `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` na Vercel e fazer Redeploy.
2. **Encerrar sessões suspeitas:** Supabase › Authentication › Users › (usuário) › Sign out; se geral, rotacionar o JWT secret/chaves de assinatura.
3. **Fechar a porta:** se a falha for no código, publicar a correção ou voltar para o deploy anterior na Vercel (Deployments › Promote/Rollback).
4. **Preservar evidências:** exportar os logs da Vercel e do Supabase do período, sem apagar nada.

## 3. Até 3 dias úteis — avaliar e comunicar

Avaliar se o incidente **pode causar risco ou dano relevante** aos titulares (dados financeiros, CPF, comprovantes, grande volume). Se sim:

- **Comunicar a ANPD** em até 3 dias úteis a partir do conhecimento, pelo formulário no site gov.br/anpd, com: descrição, dados afetados, titulares envolvidos (quantidade), medidas tomadas, riscos, contato do Encarregado.
- **Comunicar os titulares afetados** no mesmo prazo, em linguagem simples, por e-mail: o que aconteceu, quais dados, o que fizemos e o que a pessoa deve fazer (ex.: trocar a senha, ativar 2FA).

Se o risco não for relevante, registrar a análise e a decisão neste repositório (seção 5), pois a ANPD pode pedir.

## 4. Depois — corrigir a causa

- Identificar a causa raiz e corrigir (código, configuração, permissão).
- Adicionar teste que impeça a repetição (ex.: `tests/e2e`, testes de RLS).
- Revisar o `docs/lgpd/registro-de-operacoes.md`.

## 5. Registro de incidentes

Guardar por no mínimo 5 anos (Resolução 15/2024, art. 10).

| Data | O que aconteceu | Dados/titulares | Risco relevante? | Comunicações (ANPD/titulares) | Correção |
|---|---|---|---|---|---|
| — | Nenhum incidente registrado | — | — | — | — |
