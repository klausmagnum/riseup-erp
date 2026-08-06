-- Remove a coluna que guardava senha de usuario em texto claro.
--
-- usuarios_sistema.senha_temporaria era uma copia legivel da mesma senha que o
-- Supabase Auth ja guarda com hash. Em 06/08/2026 ela vazou publicamente: a
-- rota /api/dev/users-list respondia sem autenticacao nenhuma em producao e
-- devolvia a tabela inteira com um select("*"), a coluna junto.
--
-- A rota foi removida e o codigo parou de gravar a coluna - a senha agora vai
-- so para o Auth, pela rota /api/auth/definir-senha. Derrubar a coluna fecha o
-- caminho de vez: enquanto ela existir, qualquer select("*") futuro sobre esta
-- tabela volta a expor segredo.
--
-- Rode no SQL Editor do Supabase. As migrations deste repositorio nao sao
-- aplicadas pelo deploy da Vercel.

-- Zera antes de derrubar. Se a coluna ja tiver sido removida numa execucao
-- anterior, o bloco inteiro e pulado sem erro.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios_sistema'
      and column_name = 'senha_temporaria'
  ) then
    update public.usuarios_sistema set senha_temporaria = null;
    alter table public.usuarios_sistema drop column senha_temporaria;
  end if;
end $$;

-- Conferencia: deve devolver zero linhas.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'usuarios_sistema'
  and column_name = 'senha_temporaria';
