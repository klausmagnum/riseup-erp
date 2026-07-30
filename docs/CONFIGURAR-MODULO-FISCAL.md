# Como ligar o módulo de documentos fiscais

Guia para colocar a sincronização automática de NF-e no ar. São 6 etapas.
Faça na ordem — a etapa 1 evita um erro que trava as demais.

---

## Etapa 1 — Criar um Drive Compartilhado

**Por que isso primeiro:** uma conta de serviço do Google tem **zero** de espaço
de armazenamento próprio. Se você apenas compartilhar uma pasta do seu "Meu
Drive" com ela, a leitura funciona, mas todo upload falha com
`storageQuotaExceeded`. Num **Drive Compartilhado** os arquivos pertencem ao
drive, não à conta de serviço, e o problema não existe.

Você tem Google Workspace, então tem esse recurso disponível.

1. Abra o [Google Drive](https://drive.google.com)
2. No menu à esquerda, clique em **Drives compartilhados**
3. Clique em **Novo** e dê o nome: `TF - Documentos Fiscais`
4. Entre nesse drive e crie uma pasta chamada `Clientes`

Deixe a aba aberta — vamos voltar aqui na etapa 3.

---

## Etapa 2 — Criar a conta de serviço no Google Cloud

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. No topo, clique no seletor de projeto e depois em **Novo projeto**
   - Nome: `RiseUP ERP`
   - Clique em **Criar** e aguarde. Depois selecione esse projeto.
3. Ative a API do Drive:
   - Menu ☰ → **APIs e serviços** → **Biblioteca**
   - Busque por `Google Drive API`
   - Clique nela e depois em **Ativar**
4. Crie a conta de serviço:
   - Menu ☰ → **APIs e serviços** → **Credenciais**
   - **Criar credenciais** → **Conta de serviço**
   - Nome: `riseup-drive`
   - Clique em **Criar e continuar**, depois em **Continuar** e **Concluído**
     (não precisa conceder papéis nesta tela)
5. Gere a chave:
   - Clique na conta de serviço recém-criada
   - Aba **Chaves** → **Adicionar chave** → **Criar nova chave**
   - Escolha o tipo **JSON** → **Criar**
   - Um arquivo `.json` será baixado. **Guarde bem: ele não pode ser baixado
     de novo.**

Ainda nessa tela, **copie o e-mail da conta de serviço**. Tem esta cara:

```
riseup-drive@riseup-erp-123456.iam.gserviceaccount.com
```

---

## Etapa 3 — Dar acesso do Drive à conta de serviço

1. Volte ao **Drive compartilhado** `TF - Documentos Fiscais`
2. Clique no nome do drive no topo → **Gerenciar membros**
3. Cole o e-mail da conta de serviço que você copiou
4. Defina a permissão como **Gerenciador de conteúdo**
5. Clique em **Enviar**

Agora pegue o ID da pasta:

1. Abra a pasta `Clientes` dentro do drive compartilhado
2. Olhe a barra de endereço. Vai estar assim:
   `https://drive.google.com/drive/folders/1AbC2DeFgH3IjKlMnOpQrStUvWxYz`
3. **O ID é o trecho final**, depois de `/folders/`:
   `1AbC2DeFgH3IjKlMnOpQrStUvWxYz`

Anote — é o `GOOGLE_DRIVE_ROOT_FOLDER_ID`.

---

## Etapa 4 — Converter o JSON em uma linha só

O arquivo JSON precisa virar texto base64 para caber numa variável de ambiente.

Abra o **PowerShell** e rode, trocando o caminho pelo do arquivo que você baixou:

```bash
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\klaus\Downloads\riseup-erp-123456.json")) | Set-Clipboard
```

O resultado já vai para a área de transferência. É um texto longo, sem quebras
de linha — isso é o esperado.

> **Depois de configurar tudo, apague o arquivo `.json` da pasta Downloads.**
> Ele é a chave de acesso ao Drive.

---

## Etapa 5 — Aplicar a migration no Supabase

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e abra o projeto do RiseUP
2. No menu à esquerda, clique em **SQL Editor**
3. Clique em **New query**
4. Abra o arquivo abaixo no VS Code, copie **todo** o conteúdo e cole no editor:

   `supabase/migrations/20260730120000_add_nsu_e_unicidade_documentos_fiscais.sql`

5. Clique em **Run** (ou Ctrl+Enter)

Deve aparecer `Success. No rows returned`. Isso é sucesso — o script cria
colunas e índices, não devolve dados.

Rodar duas vezes por engano não causa problema: todos os comandos usam
`if not exists`.

---

## Etapa 6 — Configurar as variáveis

### 6a) No seu computador (para testar local)

Abra o arquivo `.env.local` na raiz do projeto e **acrescente** estas linhas ao
que já existe (não apague as três do Supabase):

```
CERTIFICADO_ENCRYPTION_KEY=Uvw+0wP2BXDQ89EoUNdHJRZa5lS73v3FEnFMOUmAihNqMJa9I99YoO9AFR5SOM83
CRON_SECRET=63bfa35acc06fa3da6b52172d4224557c644e3e71d4ef0118462dee261131d7f
GOOGLE_DRIVE_ROOT_FOLDER_ID=<o ID que você anotou na etapa 3>
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_B64=<cole o texto base64 da etapa 4>
```

> A `CERTIFICADO_ENCRYPTION_KEY` é o que embaralha as senhas dos certificados.
> **Se ela for trocada depois, todas as senhas já salvas param de abrir** e os
> certificados precisam ser recadastrados. Guarde uma cópia em lugar seguro.

### 6b) Na Vercel (para valer em produção)

1. Acesse [vercel.com](https://vercel.com) e abra o projeto do RiseUP
2. **Settings** → **Environment Variables**
3. Adicione as **mesmas quatro** variáveis, uma por vez
4. Em cada uma, marque os três ambientes: **Production**, **Preview** e **Development**
5. Depois de salvar todas, vá em **Deployments** e clique em **Redeploy** no
   deploy mais recente — variáveis novas só valem em deploy novo

---

## Conferindo se funcionou

Rode no terminal, dentro da pasta do projeto:

```bash
npx tsx scripts/verificar-sefaz.mts
```

Deve terminar com `37 passaram, 0 falharam`. Esse teste não depende de nenhuma
configuração acima — ele confirma que a leitura dos documentos da SEFAZ está
correta. Se falhar, o problema é no código, não na sua configuração.

Para testar de ponta a ponta é preciso um certificado A1 cadastrado. Aí sim:

1. Suba o RiseUP local (`npm run dev`)
2. **Cadastros → Clientes →** abra um cliente **→ aba Certificados**
3. Cadastre o certificado A1 (arquivo `.pfx` e a senha)
4. Clique em **Testar** — deve dizer "Certificado validado com sucesso"
5. Vá em **Documentos Fiscais → NF-e → Sincronizar NF-e**
6. Escolha o cliente e deixe o ambiente em **Homologação** na primeira vez

---

## O que esperar na primeira sincronização

**Vai demorar mais que as seguintes.** A SEFAZ guarda os documentos dos últimos
90 dias e a primeira execução puxa tudo, de 50 em 50. Se o processo parar no
meio por tempo, ele grava onde chegou e continua na próxima — nada se perde.

**A maioria vai chegar como resumo, não como XML completo.** Isso é
funcionamento normal da SEFAZ, não erro: o XML integral só é liberado após a
manifestação do destinatário. O resumo traz chave, emitente, valor e data —
serve para conferência, mas não para escrituração. Esses documentos aparecem
com pendência `AGUARDA_MANIFESTACAO`.

**Se aparecer "consumo indevido":** você consultou o mesmo CNPJ mais de uma vez
dentro de uma hora sem haver documento novo. A SEFAZ bloqueia por 1 hora. O
sistema já respeita isso sozinho no modo automático — só acontece se você ficar
clicando em Sincronizar manualmente.

---

## Depois que estiver rodando

O cron já está configurado em `vercel.json` para rodar às **8h, 12h, 16h e
20h**. Ele começa a funcionar assim que o deploy com as variáveis subir.

Para acompanhar: **Documentos Fiscais → Sincronizações** mostra cada execução,
quantos documentos vieram e o que deu errado.

---

## Se algo der errado

| Mensagem | O que significa | O que fazer |
|---|---|---|
| `storageQuotaExceeded` | A pasta não está num Drive Compartilhado | Refazer a etapa 1 |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_B64 nao configurado` | Variável faltando ou deploy antigo | Conferir etapa 6 e redeployar |
| `File not found` no Drive | A conta de serviço não foi adicionada ao drive | Refazer a etapa 3 |
| `Segredo criptografado invalido` | A `CERTIFICADO_ENCRYPTION_KEY` mudou | Recadastrar as senhas dos certificados |
| `mac verify failure` | Senha do certificado incorreta | Recadastrar o certificado com a senha certa |
| `Certificado ... venceu em ...` | Certificado A1 vencido | Cadastrar o novo certificado do cliente |
