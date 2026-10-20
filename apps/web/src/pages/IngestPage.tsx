import { useEffect, useState } from "react";
import { useIngest, jobCount } from "../ingest";

interface Root { id: number; path: string; confidential: boolean; last_scan_at: string | null; files: string; indexed: string }

const KIND_LABEL: Record<string, string> = { scan: "Analyse des dossiers", process: "Lecture des fichiers", ocr: "Reconnaissance de texte (OCR)", embed: "Indexation sémantique" };

export function IngestPage() {
  const { state } = useIngest();
  const [roots, setRoots] = useState<Root[]>([]);
  const [path, setPath] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => fetch("/api/roots").then((r) => r.json()).then(setRoots).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  async function post(url: string, body?: unknown) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    return r.json().catch(() => ({}));
  }
  async function add(p: string) {
    if (!p.trim()) return;
    await post("/api/roots", { path: p.trim(), confidential });
    setPath(""); setMsg(`Dossier ajouté : ${p}`); load();
  }
  async function pick() {
    const r = await post("/api/system/pick-folder");
    if (r.path) setPath(r.path);
  }

  const kinds = ["scan", "process", "ocr", "embed"];
  return (
    <section>
      <h2>Dépôt de fichiers</h2>
      <p className="hint">Indiquez un dossier : tous ses fichiers sont indexés en arrière-plan (les originaux ne sont ni copiés ni déplacés). Vous pouvez quitter cette page, le traitement continue.</p>
      <div className="row">
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="D:\Documents\MonDossier" />
        <button onClick={pick}>Parcourir…</button>
        <button className="primary" onClick={() => add(path)}>Indexer ce dossier</button>
      </div>
      <label className="check"><input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} /> Confidentiel (jamais envoyé à l'IA externe)</label>
      {msg && <p className="ok">{msg}</p>}

      <h3>Progression</h3>
      <div className="row">
        {state?.paused
          ? <button onClick={() => post("/api/ingest/resume")}>Reprendre</button>
          : <button onClick={() => post("/api/ingest/pause")}>Mettre en pause</button>}
        <button onClick={() => post("/api/ingest/retry-failed")}>Relancer les échecs</button>
      </div>
      <table>
        <thead><tr><th>Étape</th><th>En attente</th><th>En cours</th><th>Terminé</th><th>Échec</th></tr></thead>
        <tbody>
          {kinds.map((k) => (
            <tr key={k}>
              <td>{KIND_LABEL[k]}</td>
              <td>{jobCount(state, ["pending"], k)}</td><td>{jobCount(state, ["running"], k)}</td>
              <td>{jobCount(state, ["done"], k)}</td><td className={jobCount(state, ["failed"], k) ? "warn" : ""}>{jobCount(state, ["failed"], k)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state && <p className="meta">Documents : {state.documents.documents} · recherche par mots prête : {state.documents.lexical} · recherche sémantique prête : {state.documents.embedded}</p>}
      {state?.failures.length ? <details><summary>{state.failures.length} échec(s) récents</summary><ul>{state.failures.map((f) => <li key={f.id}>{f.kind} : {f.error}</li>)}</ul></details> : null}

      <h3>Dossiers indexés</h3>
      <table>
        <thead><tr><th>Dossier</th><th>Fichiers</th><th>Indexés</th><th>Dernière analyse</th><th /></tr></thead>
        <tbody>
          {roots.map((r) => (
            <tr key={r.id}>
              <td>{r.path}{r.confidential && <span className="chip">confidentiel</span>}</td>
              <td>{r.files}</td><td>{r.indexed}</td>
              <td>{r.last_scan_at ? new Date(r.last_scan_at).toLocaleString("fr-FR") : "—"}</td>
              <td><button onClick={() => post(`/api/roots/${r.id}/scan`)}>Ré-analyser</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
