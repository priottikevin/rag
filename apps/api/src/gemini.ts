import { pool } from "./db.js";
import { search } from "./search.js";
import { redact, isBlocked } from "./redact.js";

export const geminiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

export interface Source { n: number; fileId: number; title: string; path: string; page: number | null }
export interface Answer { answer: string | null; sources: Source[]; redactions: number; blocked: number; skippedConfidential: number; reason?: string }

/** Réponse rédigée : récupère les meilleurs passages, retire tout secret / contenu confidentiel, envoie uniquement ces extraits à Gemini. */
export async function answer(question: string): Promise<Answer> {
  const { hits } = await search(question, 14, undefined, undefined, true);
  const ids = hits.map((h) => h.fileId);
  const conf = ids.length
    ? await pool.query(
        `SELECT fp.id, fp.confidential OR COALESCE((d.meta->>'sensitive')::boolean, false) AS blocked
         FROM file_paths fp LEFT JOIN documents d ON d.blob_id = fp.blob_id WHERE fp.id = ANY($1)`, [ids])
    : { rows: [] };
  const blockedFiles = new Set(conf.rows.filter((r) => r.blocked).map((r) => Number(r.id)));

  const sources: Source[] = [];
  const parts: string[] = [];
  let redactions = 0, blocked = 0, skippedConfidential = 0;
  for (const h of hits) {
    if (sources.length >= 6) break;
    if (blockedFiles.has(h.fileId)) { skippedConfidential++; continue; }
    const r = redact(h.snippet);
    if (isBlocked(r.text, r.count)) { blocked++; continue; }
    redactions += r.count;
    const n = sources.length + 1;
    sources.push({ n, fileId: h.fileId, title: h.title, path: h.path, page: h.page });
    parts.push(`[${n}] (${h.title}${h.page ? `, p.${h.page}` : ""})\n${r.text}`);
  }
  const base = { sources, redactions, blocked, skippedConfidential };
  if (!geminiEnabled()) return { ...base, answer: null, reason: "Clé Gemini absente (GEMINI_API_KEY dans .env)." };
  if (!parts.length) return { ...base, answer: null, reason: "Aucun extrait envoyable (confidentiels ou sensibles exclus)." };

  const prompt =
    "Tu réponds en français, uniquement à partir des extraits numérotés ci-dessous. Cite les sources entre crochets, ex. [1]. " +
    "Si les extraits ne permettent pas de répondre, dis-le.\n\nEXTRAITS :\n" + parts.join("\n\n") + `\n\nQUESTION : ${question}`;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) return { ...base, answer: null, reason: `Gemini a répondu ${res.status}` };
  const data: any = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("");
  await pool.query("INSERT INTO audit_llm(purpose, chunk_ids, redactions) VALUES ($1,$2,$3)", ["answer", sources.map((s) => s.fileId), redactions]);
  return { ...base, answer: text ?? null, reason: text ? undefined : "Réponse vide" };
}
