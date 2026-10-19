# LumeTV

Projeto acadêmico de uma plataforma web de filmes e séries.

## Funcionalidades atuais

- Cadastro de usuários com nome, e-mail e senha.
- Login e logout.
- Catálogo inicial de filmes e séries com capas ilustrativas, sinopses e gêneros.

## Requisitos

- Node.js
- npm

## Como executar

Instale as dependências com npm install e inicie o servidor com node app.js.

Acesse http://localhost:3000 no navegador. Para ver o catálogo, crie uma conta ou entre com uma já cadastrada.

## Observações

As contas cadastradas são gravadas localmente em data/users.json, que é ignorado pelo Git. As sessões ficam em memória e são encerradas quando o servidor reinicia. O catálogo atual usa títulos demonstrativos.
