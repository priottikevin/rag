import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename, dirname } from "node:path";
import { pool } from "./db.js";
import { PyWorker } from "./pyworker.js";
import { chunkPieces, type Piece } from "./chunker.js";
import { scanRoot } from "./scanner.js";
import { SENSITIVE_MARKER } from "./redact.js";

const extractor = new PyWorker("extract");
const embedder = new PyWorker("embed", { EMBED_THREADS: "4" });

const queryEmbedder = new PyWorker("query", { EMBED_THREADS: "2" });
export async function embedQuery(q: string): Promise<number[]> {
  const { vectors } = await queryEmbedder.call("embed", { texts: [q], mode: "query" });
  return vectors[0];
}

export async function rerank(query: string, texts: string[]): Promise<number[]> {
  const { scores } = await queryEmbedder.call("rerank", { query, texts });
  return scores;
}

function sha256(path: string): Promise<Buffer> {
  return new Promise((res, rej) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => res(h.digest())).on("error", rej);
  });
}

async function insertChunks(documentId: number, pieces: Piece[], folder: string, name: string) {
  const chunks = chunkPieces(pieces, basename(folder), name);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM chunks WHERE document_id=$1", [documentId]);
    for (let i = 0; i < chunks.length; i += 200) {
      const part = chunks.slice(i, i + 200);
      const vals: unknown[] = [];
      const rows = part.map((c, k) => {
        vals.push(documentId, c.ord, c.page, c.text, c.ctx);
        const b = k * 5;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}, to_tsvector('french', unaccent($${b + 5})))`;
      });
      await client.query(`INSERT INTO chunks(document_id, ord, page, text, ctx_text, tsv) VALUES ${rows.join(",")}`, vals);
    }
    if (chunks.some((c) => SENSITIVE_MARKER.test(c.text)))
      await client.query("UPDATE documents SET meta = meta || '{\"sensitive\": true}'::jsonb WHERE id=$1", [documentId]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  return chunks.length;
}

const enqueue = (kind: string, payload: object, priority: number) =>
  pool.query("INSERT INTO jobs(kind,payload,priority) VALUES ($1,$2,$3)", [kind, JSON.stringify(payload), priority]);

/** Job 'process' : hash -> dédup -> extraction -> chunks lexicaux (passe 1). */
async function processFile(payload: { filePathId: number }) {
  const { rows } = await pool.query("SELECT id, path, size FROM file_paths WHERE id=$1", [payload.filePathId]);
  if (!rows.length) return;
  const fp = rows[0];
  const hash = await sha256(fp.path);
  const b = await pool.query(
    `INSERT INTO blobs(sha256,size) VALUES ($1,$2) ON CONFLICT (sha256) DO UPDATE SET size=blobs.size RETURNING id`, [hash, fp.size]);
  const blobId = b.rows[0].id;
  await pool.query("UPDATE file_paths SET blob_id=$1, status='hashed', error=NULL WHERE id=$2", [blobId, fp.id]);
  const existing = await pool.query("SELECT id FROM documents WHERE blob_id=$1", [blobId]);
  if (existing.rows.length) { await pool.query("UPDATE file_paths SET status='indexed' WHERE id=$1", [fp.id]); return; } // contenu déjà connu : on garde juste le chemin

  const ex = await extractor.call("extract", { path: fp.path });
  const d = await pool.query(
    `INSERT INTO documents(blob_id,title,kind,page_count,text_quality,stage,extracted_at) VALUES ($1,$2,$3,$4,$5,0,now()) RETURNING id`,
    [blobId, basename(fp.path), ex.kind, ex.page_count ?? null, ex.quality]);
  const docId = d.rows[0].id;
  const n = await insertChunks(docId, ex.pages as Piece[], dirname(fp.path), basename(fp.path));
  if (n) {
    await pool.query("UPDATE documents SET stage=1 WHERE id=$1", [docId]);
    await enqueue("embed", { documentId: docId }, 5);
  }
  if (ex.needs_ocr) await enqueue("ocr", { documentId: docId, filePathId: fp.id }, 1);
  await pool.query("UPDATE file_paths SET status='indexed' WHERE id=$1", [fp.id]);
}

/** Job 'ocr' : OCR (PDF sans texte / images) puis chunks + embeddings. */
async function ocrFile(payload: { documentId: number; filePathId: number }) {
  const { rows } = await pool.query("SELECT path FROM file_paths WHERE id=$1", [payload.filePathId]);
  if (!rows.length) return;
  const r = await extractor.call("ocr", { path: rows[0].path });
  await pool.query("UPDATE documents SET text_quality=$2, extracted_at=now() WHERE id=$1", [payload.documentId, r.quality]);
  const n = await insertChunks(payload.documentId, r.pages as Piece[], dirname(rows[0].path), basename(rows[0].path));
  if (n) { await pool.query("UPDATE documents SET stage=1 WHERE id=$1", [payload.documentId]); await enqueue("embed", { documentId: payload.documentId }, 5); }
}

/** Passages « données brutes » (peu de lettres) : indexés en lexical seulement, pas de vecteur (bruit pour la recherche dense, et gain de temps d'indexation). */
export const PROSE_SQL = "(length(regexp_replace(text,'[^[:alpha:]]','','g'))::float / greatest(length(text),1)) >= 0.35";

/** Job 'embed' : vecteurs e5-small pour les chunks sans embedding. */
async function embedDoc(payload: { documentId: number }) {
  for (;;) {
    const { rows } = await pool.query(`SELECT id, ctx_text FROM chunks WHERE document_id=$1 AND embedding IS NULL AND ${PROSE_SQL} ORDER BY id LIMIT 64`, [payload.documentId]);
    if (!rows.length) break;
    const { vectors } = await embedder.call("embed", { texts: rows.map((r) => r.ctx_text.slice(0, 2500)), mode: "passage" });
    await pool.query(
      `UPDATE chunks c SET embedding = v.e::vector FROM (SELECT unnest($1::int8[]) AS id, unnest($2::text[]) AS e) v WHERE c.id = v.id`,
      [rows.map((r) => r.id), vectors.map((v: number[]) => `[${v.join(",")}]`)]);
  }
  await pool.query("UPDATE documents SET stage=2 WHERE id=$1", [payload.documentId]);
}

async function scanJob(payload: { rootId: number }) { await scanRoot(payload.rootId); }

const HANDLERS: Record<string, (p: any) => Promise<void>> = { process: processFile, ocr: ocrFile, embed: embedDoc, scan: scanJob };

/** Prend un job par SKIP LOCKED parmi `kinds`. Retourne false s'il n'y en a pas. */
async function runOne(kinds: string[], who: string): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE jobs SET status='running', started_at=now(), attempts=attempts+1, locked_by=$2
     WHERE id = (SELECT id FROM jobs WHERE status='pending' AND kind = ANY($1) ORDER BY priority DESC, id FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id, kind, payload, attempts`, [kinds, who]);
  if (!rows.length) return false;
  const job = rows[0];
  try {
    await HANDLERS[job.kind](job.payload);
    await pool.query("UPDATE jobs SET status='done', finished_at=now() WHERE id=$1", [job.id]);
  } catch (e: any) {
    const retry = job.attempts < 3;
    const msg = String(e?.message ?? e).slice(0, 500);
    await pool.query("UPDATE jobs SET status=$2, error=$3, finished_at=now() WHERE id=$1", [job.id, retry ? "pending" : "failed", msg]);
    if (!retry && job.payload.filePathId) await pool.query("UPDATE file_paths SET status='error', error=$2 WHERE id=$1", [job.payload.filePathId, msg]);
  }
  return true;
}

let paused = false;
export const setPaused = (p: boolean) => { paused = p; };
export const isPaused = () => paused;

/** Démarre les boucles d'arrière-plan. Les jobs 'running' orphelins (crash) repassent en 'pending'. */
export async function startBackground() {
  await pool.query("UPDATE jobs SET status='pending' WHERE status='running'");
  const loop = async (kinds: string[], who: string) => {
    for (;;) {
      try {
        const did = paused ? false : await runOne(kinds, who);
        if (!did) await new Promise((r) => setTimeout(r, 1500));
      } catch { await new Promise((r) => setTimeout(r, 3000)); }
    }
  };
  void loop(["scan", "process", "ocr"], "extractor");
  void loop(["embed"], "embedder");
}
