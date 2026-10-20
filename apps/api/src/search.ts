import { pool } from "./db.js";
import { embedQuery, rerank } from "./pipeline.js";
import type { SearchHit } from "@rag/shared";

const W_DENSE = 1.0;
const W_LEX = 0.3;
const K = 60;

function lexQuery(q: string): string | null {
  const words = q.match(/[\p{L}\p{N}]{2,}/gu);
  return words && words.length ? [...new Set(words)].join(" | ") : null;
}

const QWORDS = new Set("combien quel quelle quels quelles qui que quoi quand ou où comment pourquoi est sont a ont fait faire coute coûte cout coût donne donner liste lister trouve trouver cherche chercher document documents fichier fichiers moi mon ma mes".split(" "));

/** Requête ET sur les mots porteurs de sens (hors mots interrogatifs) : plus précise que le OU, utilisée en priorité. */
function lexAndQuery(q: string): string | null {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !QWORDS.has(w));
  return words.length >= 2 ? [...new Set(words)].join(" & ") : null;
}

interface Row { id: string; document_id: string; page: number | null; text: string }

/** Recherche hybride : lexical (FTS français + unaccent) + dense (e5-small), fusion RRF pondérée, regroupement par document. */
export async function search(q: string, limit = 20, wDense = W_DENSE, wLex = W_LEX, useRerank = false): Promise<{ hits: SearchHit[]; ms: number; mode: string }> {
  const t0 = Date.now();
  const lq = lexQuery(q);
  const lexP = lq
    ? pool.query<Row>(
        `SELECT id, document_id, page, text FROM chunks WHERE tsv @@ to_tsquery('french', unaccent($1))
         ORDER BY ts_rank_cd(tsv, to_tsquery('french', unaccent($1)), 32) DESC LIMIT 80`, [lq])
    : Promise.resolve({ rows: [] as Row[] });
  const aq = lexAndQuery(q);
  const andP = aq
    ? pool.query<Row>(
        `SELECT id, document_id, page, text FROM chunks WHERE tsv @@ to_tsquery('french', unaccent($1))
         ORDER BY ts_rank_cd(tsv, to_tsquery('french', unaccent($1)), 32) DESC LIMIT 40`, [aq])
    : Promise.resolve({ rows: [] as Row[] });
  const denseP = (async () => {
    const hasVec = await pool.query("SELECT 1 FROM chunks WHERE embedding IS NOT NULL LIMIT 1");
    if (!hasVec.rowCount) return { rows: [] as Row[] };
    const v = await embedQuery(q);
    return pool.query<Row>(
      `SELECT id, document_id, page, text FROM chunks WHERE embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 80`, [`[${v.join(",")}]`]);
  })();
  const [lex, dense, lexAnd] = await Promise.all([lexP, denseP, andP]);

  // pénalise les passages « données brutes » (peu de lettres : listes de nombres, dumps CSV) qui attirent à tort la recherche dense
  const prose = (t: string) => {
    const letters = (t.match(/\p{L}/gu) ?? []).length;
    const ratio = letters / Math.max(1, t.length);
    return ratio >= 0.5 ? 1 : ratio >= 0.35 ? 0.7 : 0.4;
  };
  const score = new Map<string, { s: number; row: Row }>();
  const add = (rows: Row[], w: number) =>
    rows.forEach((r, i) => {
      const cur = score.get(r.id) ?? { s: 0, row: r };
      cur.s += (w / (K + i + 1)) * prose(r.text);
      score.set(r.id, cur);
    });
  add(dense.rows, wDense);
  add(lex.rows, wLex);
  add(lexAnd.rows, wLex * 2);

  // regroupement par document : score = meilleur chunk (+ petit bonus pour les chunks supplémentaires, plafonné)
  const byDoc = new Map<string, { best: number; extra: number; row: Row }>();
  for (const v of score.values()) {
    const cur = byDoc.get(v.row.document_id);
    if (!cur) byDoc.set(v.row.document_id, { best: v.s, extra: 0, row: v.row });
    else if (v.s > cur.best) { cur.extra += cur.best * 0.1; cur.best = v.s; cur.row = v.row; }
    else cur.extra += v.s * 0.1;
  }
  const docScores = new Map([...byDoc].map(([id, d]) => [id, { s: d.best + Math.min(d.extra, d.best * 0.3), row: d.row }]));
  const top = [...docScores.entries()].sort((a, b) => b[1].s - a[1].s).slice(0, limit);
  if (!top.length) return { hits: [], ms: Date.now() - t0, mode: dense.rows.length ? "hybrid" : "lexical" };

  const ids = top.map(([id]) => Number(id));
  const info = await pool.query(
    `SELECT d.id AS doc_id, d.title, array_agg(fp.path ORDER BY fp.id) AS paths, min(fp.id) AS file_id
     FROM documents d JOIN file_paths fp ON fp.blob_id = d.blob_id AND fp.status <> 'missing'
     WHERE d.id = ANY($1) GROUP BY d.id, d.title`, [ids]);
  const m = new Map(info.rows.map((r) => [String(r.doc_id), r]));
  const hits: SearchHit[] = [];
  for (const [docId, v] of top) {
    const r = m.get(docId);
    if (!r) continue;
    hits.push({
      fileId: Number(r.file_id), path: r.paths[0], paths: r.paths, title: r.title ?? r.paths[0],
      snippet: v.row.text.slice(0, 380), score: Number(v.s.toFixed(5)), page: v.row.page,
    });
  }
  let mode = dense.rows.length ? "hybrid" : "lexical";
  if (useRerank && hits.length > 1) {
    // second temps : un cross-encoder relit les meilleurs candidats ; score final = rang fusionné + rang reclassé
    const head = hits.slice(0, 12);
    const rr = await rerank(q, head.map((h) => h.snippet));
    const byRerank = rr.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s).map((x, rank) => [x.i, rank] as const);
    const rankRr = new Map(byRerank);
    const merged = head.map((h, i) => ({ h, v: 1 / (10 + i) + 1.4 / (10 + (rankRr.get(i) ?? 99)) })).sort((a, b) => b.v - a.v);
    hits.splice(0, head.length, ...merged.map((m) => m.h));
    mode += "+rerank";
  }
  return { hits, ms: Date.now() - t0, mode };
}
