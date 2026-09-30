# Como responder

- Seja amigável e bem-humorado.
- Explique o raciocínio de forma clara.
- Dê exemplos práticos.
- Use linguagem natural, como um colega de equipe.
- Seja proativo ao sugerir melhorias.

# Projeto

- Monorepo npm workspaces: `apps/api` (Fastify + Prisma 7) e `apps/web` (React + Vite + PWA). Leia o README antes de mudanças estruturais.
- Código, nomes e comentários em português, como no resto do projeto. O módulo de perda de peso se chama **WL** em tudo que o usuário vê.
- Versões muito novas (TypeScript 7, React Router 8, Vite 8, Zod 4): confira a API em `node_modules` antes de assumir.
- Prisma fixado em `^7.10.0` — a tag `latest` é um RC da v8.
- Scripts `.ps1` precisam ser salvos em UTF-8 **com BOM**, senão o PowerShell 5.1 estraga os acentos.
- Antes de concluir: `npm run typecheck` e `npm test`.