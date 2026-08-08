# Ativar as tarefas pessoais do My Desktop

O My Desktop passou a ter tarefas próprias: cada usuário cadastra as tarefas da
rotina dele, só ele enxerga as dele, e elas entram na agenda de obrigações do
dashboard na data certa, junto das obrigações do escritório.

A tarefa pode valer para **um ou vários clientes**, para **todos os clientes de
certos regimes tributários**, ou para **ninguém** — a tarefa em si. Quando tem
cliente, ela se comporta como as obrigações na agenda: abre a lista de clientes
e cada um é finalizado no seu botão, com confirmação; o dia só sai da agenda
quando o último cliente é finalizado.

## As migrations

**Este link abre direto o editor SQL do projeto, já na tela certa:**

https://supabase.com/dashboard/project/icbbqfgdlmcqvjixziar/sql/new

Clique na caixa de texto grande no meio da tela, cole o conteúdo de **cada
arquivo abaixo** (um de cada vez, nesta ordem) e clique no botão verde **Run**,
no canto inferior direito:

1. `supabase/migrations/20260807120000_criar_tarefas_pessoais.sql` — cria as
   duas tabelas. **Já rodada em 07/08/2026.**
2. `supabase/migrations/20260807163000_tarefas_pessoais_por_cliente.sql` — os
   vínculos com clientes e regimes, e a conclusão por cliente.

A resposta esperada da primeira é uma tabelinha com duas linhas:

| tabela                         | rls_ligado | policies |
| ------------------------------ | ---------- | -------- |
| tarefas_pessoais               | true       | 0        |
| tarefas_pessoais_conclusoes    | true       | 0        |

`rls_ligado = true` e `policies = 0` é o resultado certo: ninguém lê estas
tabelas direto do browser. Quem lê e grava é o servidor, pela rota
`/api/tarefas-pessoais`, que filtra tudo pelo usuário da sessão.

A da segunda é uma linha com `colunas_na_tarefa = 2`, `coluna_cliente = 1` e
`indice_novo = 1`.

Rodar duas vezes por engano não causa problema — os comandos usam
`if not exists`.

## Conferindo

Pelo banco, sem precisar entrar no sistema:

```bash
node scripts/verificar-tarefas-pessoais.mjs
```

Ele cria uma tarefa marcada como teste, exercita as regras (dois clientes no
mesmo dia, recusa de conclusão repetida, recorte por dono, chave anônima sem
acesso) e apaga tudo no fim. Tem que terminar com **`Tarefas pessoais prontas`**.

Depois, pela tela:

Entre no sistema, abra **My Desktop** e clique em **+ Nova tarefa**. Se a
tarefa salvar e aparecer na lista por data, está funcionando. Ela também deve
aparecer no **Dashboard**, na agenda, no dia escolhido, com a etiqueta
*Minha tarefa / Só você vê*.

Para conferir a parte de clientes, cadastre uma tarefa em **Todos os clientes
de um regime**: na agenda ela mostra a contagem de clientes, abre a lista ao
clicar e some do dia só depois que o último for finalizado.

Se aparecer um aviso vermelho falando em `relation "tarefas_pessoais" does not
exist`, é porque a primeira migration não foi rodada; se falar em
`column ... clientes_vinculados does not exist`, falta a segunda.

Uma tarefa mirada em clientes que hoje não alcança nenhum — regime ainda sem
cliente, ou cliente removido do cadastro — **não aparece na agenda**, igual a
uma obrigação sem empresa vinculada. Ela volta sozinha quando o cliente entrar.

## Como a privacidade é garantida

Não é só a tela que esconde a tarefa dos outros. A rota da API pega o dono da
sessão validada e usa esse id em toda consulta e em toda gravação — inclusive
ao editar, excluir e concluir. Mandar o id da tarefa de outra pessoa na mão
devolve *"Tarefa nao encontrada entre as suas tarefas"*, não a tarefa dela.
