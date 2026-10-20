import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "./db.js";

const SKIP_NAME = /^(~\$|\.|thumbs\.db$|desktop\.ini$)/i;
const SKIP_DIR = /^(node_modules|\.git|\$RECYCLE\.BIN|System Volume Information|Adobe|Visual Studio.*|Fusion 360|IISExpress|WindowsPowerShell|WinMerge|Zoom|Blackmagic Design|Pinnacle Studio|My Web Sites|FeedbackHub|Syncios Data Transfer|Vuze Downloads|Modèles Office personnalisés|__pycache__|\.venv|\.cache|AppData)$/i;

/** Parcourt récursivement une racine, enregistre les chemins, met en file un job 'process' pour les nouveaux/modifiés. */
export async function scanRoot(rootId: number): Promise<{ seen: number; queued: number }> {
  const { rows } = await pool.query("SELECT path, confidential FROM roots WHERE id=$1", [rootId]);
  if (!rows.length) throw new Error("racine inconnue");
  const root: string = rows[0].path;
  const started = new Date();
  let seen = 0, queued = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) stack.push(full); continue; }
      if (!e.isFile() || SKIP_NAME.test(e.name)) continue;
      let st;
      try { st = await stat(full); } catch { continue; }
      seen++;
      const r = await pool.query(
        `INSERT INTO file_paths(root_id, path, size, mtime, confidential) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (path) DO UPDATE SET last_seen=now(),
           status = CASE WHEN file_paths.size<>EXCLUDED.size OR file_paths.mtime<>EXCLUDED.mtime OR file_paths.status='missing' THEN 'new' ELSE file_paths.status END,
           size=EXCLUDED.size, mtime=EXCLUDED.mtime
         RETURNING id, status`,
        [rootId, full, st.size, st.mtime, rows[0].confidential],
      );
      if (r.rows[0].status === "new") {
        await pool.query(
          `INSERT INTO jobs(kind, payload, priority) SELECT 'process', $1::jsonb, 10
           WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE kind='process' AND status IN ('pending','running') AND (payload->>'filePathId')::bigint = $2)`,
          [JSON.stringify({ filePathId: Number(r.rows[0].id) }), r.rows[0].id],
        );
        queued++;
      }
    }
  }
  await pool.query("UPDATE roots SET last_scan_at=now() WHERE id=$1", [rootId]);
  await pool.query("UPDATE file_paths SET status='missing' WHERE root_id=$1 AND last_seen < $2 AND status<>'missing'", [rootId, started]);
  return { seen, queued };
}
