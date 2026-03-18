# Barbearia App (inspirado na Barbearia Vegas)

Site completo com:
- Home publica com: hero, mais agendados, todos os servicos, equipe, avaliacoes e descricao.
- Pagina de agendamento (`/agendar.html`) com escolha de servico, profissional, dia e horario.
- Painel do dono (`/admin.html`) para cadastrar e editar:
  - Configuracoes do estabelecimento e foto principal.
  - Servicos exibidos no site.
  - Cards de "mais agendados".
  - Equipe com WhatsApp, Instagram, foto e horarios por dia da semana.
  - Avaliacoes.
  - Visualizacao da agenda por profissional.
- Controle de lotacao individual por profissional e horario.

## Como rodar

```bash
npm install
npm start
```

## Firebase (dados + login do admin)

O projeto agora suporta:
- Firestore como banco principal (substitui o arquivo local quando configurado)
- Login real no admin via Firebase Authentication (email e senha)

### 1. Configure variaveis de ambiente

Crie um arquivo `.env` na raiz com os dados do seu projeto Firebase:

```env
FIREBASE_PROJECT_ID=seu-project-id
FIREBASE_CLIENT_EMAIL=seu-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nSUA_CHAVE\\n-----END PRIVATE KEY-----\\n"
FIREBASE_WEB_API_KEY=sua-web-api-key
# Alias aceito tambem: FIREBASE_API_KEY=sua-web-api-key

# Opcional: altere onde o store fica salvo no Firestore
FIREBASE_STORE_COLLECTION=barbeariaApp
FIREBASE_STORE_DOC=store
```

### 2. Ative os produtos no Firebase

- Authentication -> Sign-in method -> Email/Password
- Firestore Database -> criar banco no modo que preferir

### 3. Defina o dono do painel (opcional, recomendado)

No painel admin, campo `Owner ID` em Configuracoes gerais:
- deixe vazio para qualquer usuario autenticado acessar
- informe um `uid` para restringir o painel a um unico usuario

### 4. Comportamento com/sem Firebase

- Com variaveis Firebase configuradas: usa Firestore + exige login no admin
- Sem variaveis Firebase: continua com `data/store.json` e sem bloqueio de login

## Gerar imagem pronta para o hero

Use o comando abaixo para transformar qualquer imagem em um banner largo, no formato certo do topo do site:

```bash
npm run make:hero -- --input .\\uploads\\minha-imagem.png --output .\\uploads\\hero-pronto.webp
```

Padrao do script:
- largura: 1800 px
- altura: 540 px
- formato: webp

Exemplo com tamanho customizado:

```bash
npm run make:hero -- --input .\\uploads\\minha-imagem.png --output .\\uploads\\hero-pronto.webp --width 1600 --height 480 --quality 90
```

Acesse:
- Site: `http://localhost:3000`
- Agendar: `http://localhost:3000/agendar.html`
- Painel: `http://localhost:3000/admin.html`

## Publicar online (Render)

Este projeto pode ser publicado como um unico servico Node (frontend + backend juntos).

Opcao sem custo adicional:
- Render (plano free) para hospedar app + API.
- Firebase Firestore no plano Spark para persistencia.

1. Suba o projeto no GitHub.
2. No Render, clique em `New +` -> `Blueprint` e selecione o repositorio.
3. O arquivo `render.yaml` vai criar um Web Service automaticamente com plano `free`.
4. Em `Environment`, configure as variaveis:
  - `FIREBASE_WEB_API_KEY`
  - `FIREBASE_SERVICE_ACCOUNT_JSON` (recomendado no Render)
  - `FIREBASE_WEB_AUTH_DOMAIN`
  - `FIREBASE_WEB_PROJECT_ID`
  - `FIREBASE_WEB_APP_ID`
  - `FIREBASE_WEB_GOOGLE_CLIENT_ID` (se usar login Google)
5. Para montar `FIREBASE_SERVICE_ACCOUNT_JSON`, copie o conteudo do JSON da service account em uma unica linha.
6. Deploy e teste:
  - `https://SEU-DOMINIO/api/health`
  - `https://SEU-DOMINIO/api/firebase/config`
  - `https://SEU-DOMINIO/login.html`

Se `authEnabled` vier `false` em producao, o login vai mostrar "Login indisponivel" ate as variaveis estarem corretas no host.

## Publicar online no Firebase (Hosting + Functions)

Esse projeto esta preparado para publicar frontend e backend no Firebase usando:
- Hosting para arquivos publicos
- Cloud Functions para o `server.js` (Express)

Arquivos usados no deploy:
- `firebase.json`
- `.firebaserc`
- `index.js`

### 1) Instalar Firebase CLI

```bash
npm install -g firebase-tools
```

### 2) Login e selecao de projeto

```bash
firebase login
firebase use spbarber-6136c
```

### 3) Configurar variaveis de ambiente no Firebase

No Cloud Functions, configure pelo menos:
- `FIREBASE_WEB_API_KEY` (ou `FIREBASE_API_KEY`)
- `FIREBASE_STORE_COLLECTION` (opcional)
- `FIREBASE_STORE_DOC` (opcional)

Importante:
- Em producao no Firebase, o backend usa credenciais padrao do ambiente automaticamente.
- Nao use `FIREBASE_SERVICE_ACCOUNT_PATH` com caminho local do Windows no ambiente cloud.

### 4) Deploy

```bash
npm run firebase:deploy
```

### 5) Testes apos deploy

- `https://SEU_DOMINIO/api/health`
- `https://SEU_DOMINIO/api/firebase/config`
- `https://SEU_DOMINIO/login.html`

Se `authEnabled` vier `false`, revise as variaveis de ambiente da Function.

## Persistencia

Os dados ficam em `data/store.json`.
As imagens ficam em `uploads/`.

## Rotas principais da API

- `GET /api/site`
- `GET /api/availability?serviceId=...&teamId=...&date=YYYY-MM-DD`
- `POST /api/appointments`
- `GET /api/admin/data`
- `PUT /api/admin/settings`
- `POST/PUT/DELETE /api/admin/services`
- `POST/PUT/DELETE /api/admin/most-booked`
- `POST/PUT/DELETE /api/admin/team`
- `POST /api/admin/upload/hero`
- `POST /api/admin/upload/team/:id`
- `POST/DELETE /api/admin/reviews`
