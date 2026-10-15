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

# Git

**Commite e dê push sem perguntar.** Sou o único que desenvolve e o único que
usa o app: não há ninguém para revisar antes, e trabalho pronto parado na
árvore não ajuda nada.

- Direto na `main`. Nada de branch nem de PR — a história é linear e é só minha.
- Um commit por assunto. Se o trabalho mexeu em duas coisas que se explicam
  separado, são dois commits, mesmo que caiam no mesmo arquivo.
- Mensagem em português, no feitio das que já estão lá: título curto no
  imperativo e um corpo que conta **por que** ficou assim, não o que o diff já
  mostra. Termine com a linha `Co-Authored-By`.
- Diga na mensagem o que **não** foi verificado. É o que me avisa, meses
  depois, que aquele commit nunca passou por um navegador ou por um banco.
- Verifique antes de commitar, não depois: `npm run typecheck` e `npm test`.
  Commit que não compila é pior que commit nenhum.
- O push automático vale para commit novo. **Reescrever o que já subiu não**:
  nada de `--force`, `rebase` do que já foi empurrado ou `commit --amend` em
  commit publicado — para isso, pergunte.
- Nunca `--no-verify`. Se um hook reclamar, o problema é o que ele apontou.

# Banco de dados

**Os dados são do usuário. Não escreva neles.**

- Nada de criar, semear, editar ou apagar registros — nem "só para testar", nem
  dados que pareçam ser de exemplo. Quem cadastra ações, refeições, pesagens e
  meta é o usuário, e ele faz isso conforme o código avança.
- Nada de `truncate`, `DELETE`, `prisma migrate reset` ou scripts que gravem.
  Se algo assim parecer necessário, **pergunte antes** e espere a resposta.
- Não presuma que uma linha é resíduo de teste. Já aconteceu de apagar
  cadastros reais por essa suposição, e não havia backup para desfazer.
- Testes de ponta a ponta que gravam no banco: não. Se um dia forem
  necessários, o caminho é um banco `trimly_teste` separado — e isso também se
  pergunta antes.
- Migrações podem ser criadas e aplicadas normalmente (elas mudam o schema, não
  os dados). Só o `reset` é que está fora.
- Antes de qualquer operação de risco que o usuário autorize: `npm run backup`.
- Confira para onde o `.env` aponta antes de escrever qualquer coisa: a mesma
  máquina pode ter um banco local de desenvolvimento e o banco de verdade
  alcançável pelo Tailscale.

## Como verificar sem escrever

- `npm run typecheck`, `npm test` (as funções puras de `calculos.ts`) e
  `npm run build`.
- Requisições `GET` à API — leem e não mexem em nada.
- O resto é o usuário clicando. **Diga explicitamente o que você não conseguiu
  verificar**, em vez de deixar parecer que está tudo provado.