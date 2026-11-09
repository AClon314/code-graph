export function hexToRgb(hex: string): [number, number, number] | null {
  if (typeof hex !== "string") return null;
  const value = hex.charAt(0) === "#" ? hex.slice(1) : hex;
  if (value.length !== 6) return null;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if (r !== r || g !== g || b !== b) return null;
  return [r, g, b];
}

export function utf8Len(value: string): number {
  let count = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    count += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return count;
}

export function byteToChar(value: string, byteColumn: number): number {
  let bytes = 0;
  let chars = 0;
  for (const ch of value) {
    if (bytes >= byteColumn) return chars;
    bytes += utf8Len(ch);
    chars++;
  }
  return chars;
}
