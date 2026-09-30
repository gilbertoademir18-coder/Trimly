/**
 * Dias do calendário, sem hora nem fuso.
 *
 * Uma pesagem acontece "no dia 30", não "às 03:00Z do dia 30". Por isso a
 * coluna é DATE e a API troca strings `AAAA-MM-DD`: quem decide que dia é hoje
 * é o celular de quem se pesou, e não o fuso do servidor. O Prisma entrega
 * DATE como um Date à meia-noite UTC, e é só nessa fronteira que convertemos.
 */

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `"2026-09-30"` → Date à meia-noite UTC, ou `null` se não for um dia real. */
export function diaParaDate(dia: string): Date | null {
  const m = FORMATO.exec(dia);
  if (!m) return null;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(a, me - 1, d));
  // Date.UTC aceita 31/02 e rola para março; conferir de volta barra isso.
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== me - 1 || data.getUTCDate() !== d) {
    return null;
  }
  return data;
}

/** Date (meia-noite UTC, vindo de coluna DATE) → `"2026-09-30"`. */
export function dateParaDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}
