# Instalação no Easypanel

Este projeto está pronto para rodar no **Easypanel** usando o `Dockerfile` incluído na raiz, com banco de dados persistente automático (**SQLite** em volume persistente ou **PostgreSQL** externo).

## Opção 1: Instalação Simples (SQLite com Volume Persistente)

Não precisa criar serviço de banco separado — o sistema cria e gerencia o banco SQLite automaticamente.

1. No Easypanel, crie um novo **Projeto** e adicione um serviço do tipo **App**.
2. Em **Source**, conecte seu repositório Git (ou faça upload dos arquivos) e selecione **Build: Dockerfile**.
3. Em **Domains / Ports**, configure a porta interna do container como `3000`.
4. Em **Mounts (Volumes)**, adicione um volume persistente:
   - **Mount Path:** `/app/data`
   - *(Isso garante que as cartelas, sorteios, logo e histórico nunca se percam ao reiniciar ou atualizar o container.)*
5. *(Opcional)* Em **Environment**, adicione:
   ```env
   PORT=3000
   NODE_ENV=production
   SQLITE_PATH=/app/data/bingo.db
   ```
6. Em **Healthcheck** (opcional), configure o caminho `/api/health` na porta `3000`.
7. Clique em **Deploy**.

## Opção 2: Com Banco PostgreSQL do Easypanel

Se preferir usar um banco **PostgreSQL** dedicado no Easypanel:

1. No mesmo projeto do Easypanel, crie um serviço **PostgreSQL** (ex.: nome `bingo-db`).
2. Copie a string de conexão interna fornecida pelo Easypanel (`postgres://postgres:SENHA@bingo-db:5432/postgres`).
3. No serviço **App**, em **Environment**, configure:
   ```env
   PORT=3000
   NODE_ENV=production
   DATABASE_URL=postgres://postgres:SENHA@bingo-db:5432/postgres
   DATABASE_SSL=false
   ```
4. Clique em **Deploy**. As tabelas (`game_sessions`, `cards`, `drawn_numbers`, `game_history`) serão criadas automaticamente na inicialização.
