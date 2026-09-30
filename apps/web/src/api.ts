/**
 * `fetch` para a nossa API, que devolve o JSON ou lança um Error com a
 * mensagem que o servidor mandou em `{ erro }` — é ela que aparece na tela.
 */
export async function api<T>(caminho: string, init?: { method?: string; corpo?: unknown }): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: init?.method ?? "GET",
      headers: init?.corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.corpo === undefined ? undefined : JSON.stringify(init.corpo),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. O Trimly está rodando no PC?");
  }

  if (resposta.status === 204) return undefined as T;
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(dados?.erro ?? `O servidor respondeu ${resposta.status}.`);
  }
  return dados as T;
}
