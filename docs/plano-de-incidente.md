# Plano de resposta a incidente de segurança

Use quando houver suspeita de invasão, vazamento ou perda de dados. Mantenha a calma e siga a ordem. Anote tudo (o que viu, quando e o que fez): a ANPD pode pedir esse registro.

## 1. Conter (primeira hora)

1. **Proteja suas contas.** Troque a senha e confira a verificação em duas etapas em GitHub, Vercel, Supabase, Resend e no seu e-mail. Veja em cada uma se há sessões ou aparelhos desconhecidos e encerre.
2. **Troque as chaves secretas**, se houver chance de terem vazado:
   - Supabase → Project Settings → API: gere uma nova chave secreta (service role).
   - Vercel → Settings → Environment Variables: atualize `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY` e `BACKUP_KEY`. Depois, publique de novo (Redeploy).
3. **Se o ataque está acontecendo agora:** Vercel → Firewall → ligue o **Attack Challenge Mode**. Se precisar parar tudo, crie a variável `MANUTENCAO=1` e publique de novo. O site mostra a tela "Voltamos já".
4. **Se uma conta de usuário foi invadida:** no Supabase, em Authentication → Users, encerre as sessões dela e peça para ela trocar a senha.

## 2. Entender (primeiras 24 horas)

- **Vercel → Logs:** erros, picos de acesso e rotas incomuns.
- **Supabase → Logs (Auth e API):** logins estranhos e consultas fora do padrão.
- **No site, Equipe e aprovações → Histórico de alterações:** quem mudou o quê em cada espaço.
- **Responda:** quais dados podem ter sido vistos ou copiados, de quantas pessoas, e desde quando.

## 3. Comunicar (até 3 dias úteis)

A LGPD (Resolução CD/ANPD nº 15/2024) manda comunicar à **ANPD** e às **pessoas afetadas** quando o incidente puder causar risco ou dano relevante. É o caso, por exemplo, de dados financeiros, dados de muitas pessoas, ou dados que permitam golpes.

- **ANPD:** formulário de comunicação de incidente em gov.br/anpd.
- **Usuários:** e-mail claro dizendo o que aconteceu, quais dados foram afetados, o que já foi feito e o que a pessoa deve fazer (por exemplo: trocar a senha, ligar a verificação em duas etapas, desconfiar de mensagens pedindo pagamento).
- Não esconda nem minimize. Comunicar rápido e com clareza reduz o risco jurídico.

## 4. Recuperar

- **Dados apagados ou alterados:** o backup diário criptografado fica no Supabase Storage, na pasta `backups` (últimos 14 dias). Para abrir:
  1. Baixe o arquivo `AAAA-MM-DD.cldb` pelo painel do Supabase.
  2. Rode `BACKUP_KEY="sua chave" node scripts/abrir-backup.mjs AAAA-MM-DD.cldb`. Ele gera um JSON com todas as tabelas.
  3. Restaure só o que foi afetado. Peça ajuda antes de sobrescrever dados de produção.
- **Lançamentos excluídos há menos de 30 dias** ainda estão na lixeira do banco (`deleted_at` preenchido) e podem ser restaurados limpando esse campo.

## 5. Aprender (depois)

- Escreva em poucas linhas o que aconteceu, a causa e o que mudou para não repetir.
- Corrija a falha, rode a auditoria de segurança de novo e confira os avisos do Supabase (Advisors → Security).

## Contatos e onde ficam as coisas

| O quê | Onde |
| --- | --- |
| Alertas automáticos de segurança e falhas no backup | E-mail definido em `SECURITY_ALERT_EMAIL` (Vercel) |
| Site fora do ar | UptimeRobot, vigiando `https://cladindin.vercel.app/api/saude` |
| Backup diário | Supabase Storage → `backups` (cifrado com `BACKUP_KEY`) |
| Encarregado de dados (DPO) | Ver `lib/legal.ts` (preencher) |
