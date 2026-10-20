import Fastify from "fastify";
import cors from "@fastify/cors";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep, extname } from "node:path";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { z } from "zod";
import { migrate, pool } from "./db.js";
import { startBackground, setPaused, isPaused } from "./pipeline.js";
import { search } from "./search.js";
import { answer, geminiEnabled } from "./gemini.js";

try { process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env")); } catch { /* pas de .env */ }
const here = dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: { level: "warn" } });
await app.register(cors, { origin: true });

app.get("/api/health", async () => {
  const r = await pool.query("SELECT now() AS now");
  return { ok: true, ...r.rows[0] };
});

// ---------- racines (dossiers indexés) ----------
app.get("/api/roots", async () => (await pool.query(
  `SELECT r.id, r.path, r.enabled, r.confidential, r.last_scan_at,
          (SELECT count(*) FROM file_paths f WHERE f.root_id=r.id) AS files,
          (SELECT count(*) FROM file_paths f WHERE f.root_id=r.id AND f.status='indexed') AS indexed
   FROM roots r ORDER BY r.id`)).rows);

app.post("/api/roots", async (req, reply) => {
  const body = z.object({ path: z.string().min(2), confidential: z.boolean().optional() }).parse(req.body);
  const r = await pool.query(
    "INSERT INTO roots(path, confidential) VALUES ($1,$2) ON CONFLICT (path) DO UPDATE SET enabled=true RETURNING id", [resolve(body.path), body.confidential ?? false]);
  await pool.query("INSERT INTO jobs(kind, payload, priority) VALUES ('scan', $1, 20)", [JSON.stringify({ rootId: r.rows[0].id })]);
  return reply.code(201).send({ id: r.rows[0].id });
});

app.post("/api/roots/:id/scan", async (req) => {
  const id = Number((req.params as any).id);
  await pool.query("INSERT INTO jobs(kind, payload, priority) VALUES ('scan', $1, 20)", [JSON.stringify({ rootId: id })]);
  return { queued: true };
});

// ---------- ingestion : état, pause/reprise, événements ----------
async function ingestState() {
  const jobs = await pool.query("SELECT kind, status, count(*)::int AS n FROM jobs GROUP BY kind, status");
  const docs = await pool.query("SELECT count(*)::int AS documents, count(*) FILTER (WHERE stage>=1)::int AS lexical, count(*) FILTER (WHERE stage>=2)::int AS embedded FROM documents");
  const files = await pool.query("SELECT status, count(*)::int AS n FROM file_paths GROUP BY status");
  const recent = await pool.query("SELECT id, kind, status, error, finished_at, payload FROM jobs WHERE status IN ('failed') ORDER BY id DESC LIMIT 10");
  return { paused: isPaused(), jobs: jobs.rows, documents: docs.rows[0], files: files.rows, failures: recent.rows };
}
app.get("/api/ingest/state", ingestState);
app.post("/api/ingest/pause", async () => { setPaused(true); return { paused: true }; });
app.post("/api/ingest/resume", async () => { setPaused(false); return { paused: false }; });
app.post("/api/ingest/retry-failed", async () => {
  const r = await pool.query("UPDATE jobs SET status='pending', attempts=0 WHERE status='failed'");
  return { requeued: r.rowCount };
});

app.get("/api/ingest/events", async (req, reply) => {
  reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
  const push = async () => { try { reply.raw.write(`data: ${JSON.stringify(await ingestState())}\n\n`); } catch { /* client parti */ } };
  await push();
  const t = setInterval(push, 2000);
  req.raw.on("close", () => clearInterval(t));
  return reply;
});

app.get("/api/answer", async (req) => {
  const { q } = z.object({ q: z.string().min(1) }).parse(req.query);
  return answer(q);
});
app.get("/api/config", async () => ({ gemini: geminiEnabled() }));

// ---------- sélecteur de dossier natif (le navigateur ne donne pas de chemin complet) ----------
app.post("/api/system/pick-folder", async () => {
  const ps = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowNewFolderButton = $false; if ($f.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $f.SelectedPath }";
  return new Promise<{ path: string | null }>((res) => {
    const p = spawn("powershell.exe", ["-NoProfile", "-STA", "-Command", ps], { windowsHide: false });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => res({ path: out.trim() || null }));
    p.on("error", () => res({ path: null }));
  });
});

// ---------- recherche ----------
app.get("/api/search", async (req) => {
  const { q, limit, wd, wl, rr } = z.object({ q: z.string().min(1), limit: z.coerce.number().int().min(1).max(50).optional(), wd: z.coerce.number().optional(), wl: z.coerce.number().optional(), rr: z.coerce.number().optional() }).parse(req.query);
  return search(q, limit ?? 20, wd, wl, rr === 1);
});

// ---------- fichiers : ouvrir / afficher / servir ----------
const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8" };

async function indexedPath(fileId: number): Promise<string | null> {
  const r = await pool.query(
    `SELECT fp.path FROM file_paths fp JOIN roots r ON r.id = fp.root_id WHERE fp.id=$1`, [fileId]);
  if (!r.rows.length) return null;
  return r.rows[0].path; // le chemin est issu de la base (racines indexées) : jamais fourni par le client
}

app.post("/api/files/:id/open", async (req, reply) => {
  const { id } = req.params as any;
  const { mode } = z.object({ mode: z.enum(["open", "reveal"]).default("open") }).parse(req.body ?? {});
  const p = await indexedPath(Number(id));
  if (!p) return reply.code(404).send({ error: "introuvable" });
  const child = mode === "reveal"
    ? spawn("explorer.exe", [`/select,${p}`], { detached: true, stdio: "ignore" })
    : spawn("rundll32.exe", ["url.dll,FileProtocolHandler", p], { detached: true, stdio: "ignore" });
  child.unref();
  return { ok: true, path: p };
});

app.get("/api/files/:id/raw", async (req, reply) => {
  const p = await indexedPath(Number((req.params as any).id));
  if (!p) return reply.code(404).send({ error: "introuvable" });
  const type = MIME[extname(p).toLowerCase()] ?? "application/octet-stream";
  return reply.header("Content-Type", type).header("Content-Disposition", "inline").send(createReadStream(p));
});

const applied = await migrate(resolve(here, "../../../db/migrations"));
if (applied.length) console.log("migrations appliquées:", applied);
await startBackground();
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT ?? 3001) });
console.log("API prête sur http://127.0.0.1:3001");
