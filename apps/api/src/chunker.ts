/** Chunking déterministe : fenêtres de ~180 mots, recouvrement 30, préfixe de contexte (dossier | fichier). */
export interface Piece { page: number | null; text: string; sheet?: string }
export interface Chunk { ord: number; page: number | null; text: string; ctx: string }

const WORDS = 180;
const OVERLAP = 30;

export function chunkPieces(pieces: Piece[], folder: string, fileName: string): Chunk[] {
  const out: Chunk[] = [];
  for (const p of pieces) {
    const words = p.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const step = WORDS - OVERLAP;
    for (let i = 0; i < Math.max(1, words.length - OVERLAP); i += step) {
      const text = words.slice(i, i + WORDS).join(" ");
      const where = [folder, fileName, p.sheet].filter(Boolean).join(" | ");
      out.push({ ord: out.length, page: p.page, text, ctx: `${where} : ${text}` });
      if (i + WORDS >= words.length) break;
    }
  }
  return out;
}
