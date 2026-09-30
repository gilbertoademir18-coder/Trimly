/**
 * Gera os ícones do app a partir de uma única definição em SVG.
 *
 * Rode com `npm run icons` sempre que mudar a marca. Os arquivos vão para
 * `public/` com nomes fixos, porque o manifest do PWA e o ícone da bandeja
 * (`scripts/tray.ps1`, na raiz) apontam para eles pelo nome.
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const PASTA = new URL("../public/", import.meta.url);

/**
 * A marca: uma linha que desce em degraus e termina num ponto — progresso,
 * sem dizer de quê. O Trimly vai ter outros módulos, e o ícone não deveria
 * anunciar só um deles na tela inicial do celular.
 *
 * `margem` encolhe o desenho para dentro: ícones "maskable" são recortados
 * pelo Android em círculo, e o conteúdo precisa caber nos ~80% do meio.
 */
function svg(margem = 0) {
  const escala = 1 - margem * 2;
  const desloca = 256 * margem * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14b8a6"/>
      <stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#fundo)"/>
  <g transform="translate(${desloca} ${desloca}) scale(${escala})">
    <path d="M112 150 L200 214 L262 186 L400 330" fill="none" stroke="#f7f8f6"
          stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="400" cy="330" r="44" fill="#f7f8f6"/>
    <circle cx="400" cy="330" r="20" fill="#0f766e"/>
  </g>
</svg>`;
}

const ALVOS = [
  { arquivo: "icon-192.png", tamanho: 192, margem: 0 },
  { arquivo: "icon-512.png", tamanho: 512, margem: 0 },
  { arquivo: "icon-maskable-512.png", tamanho: 512, margem: 0.1 },
  { arquivo: "apple-touch-icon.png", tamanho: 180, margem: 0.06 },
];

await mkdir(PASTA, { recursive: true });
await writeFile(new URL("favicon.svg", PASTA), svg());
console.log("✓ favicon.svg");

for (const { arquivo, tamanho, margem } of ALVOS) {
  const png = await sharp(Buffer.from(svg(margem))).resize(tamanho, tamanho).png().toBuffer();
  await writeFile(new URL(arquivo, PASTA), png);
  console.log(`✓ ${arquivo} (${tamanho}×${tamanho}, ${png.length} bytes)`);
}
