// Decodificação de arquivos bancários brasileiros: UTF-8 ou ISO-8859-1/Windows-1252.

const HEADER_BYTES = 2048;

/** Lê o charset declarado no cabeçalho (OFX 1.x: CHARSET/ENCODING; OFX 2.x/XML: encoding="..."). */
export function declaredCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, HEADER_BYTES));
  const xml = head.match(/encoding\s*=\s*["']([\w-]+)["']/i);
  if (xml) return xml[1].toLowerCase();
  const charset = head.match(/^\s*CHARSET\s*:\s*([\w-]+)/im)?.[1];
  const encoding = head.match(/^\s*ENCODING\s*:\s*([\w-]+)/im)?.[1];
  if (encoding && /utf-?8|unicode/i.test(encoding)) return "utf-8";
  if (charset && /^(1252|windows-1252|8859-1|iso-8859-1|latin-?1)$/i.test(charset)) return "windows-1252";
  if (charset && /utf-?8/i.test(charset)) return "utf-8";
  return null;
}

/**
 * Decodifica respeitando BOM e cabeçalho. Sem declaração confiável, tenta UTF-8 estrito
 * e cai para Windows-1252 (superconjunto prático do Latin-1 usado pelos bancos).
 */
export function decodeBankFile(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }
  // Muitos bancos declaram 1252 mas gravam UTF-8 (e vice-versa). Texto Latin-1 com acentos
  // quase nunca é UTF-8 válido, então UTF-8 estrito decide melhor que o cabeçalho.
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}
