import { useState } from "react";
import type { SearchHit } from "@rag/shared";

interface Result { hits: SearchHit[]; ms: number; mode: string }
interface Ans { answer: string | null; sources: { n: number; fileId: number; title: string; page: number | null }[]; reason?: string; redactions: number; blocked: number; skippedConfidential: number }

export function SearchPage() {
  const [q, setQ] = useState(() => sessionStorage.getItem("q") ?? "");
  const [res, setRes] = useState<Result | null>(() => { try { return JSON.parse(sessionStorage.getItem("res") ?? "null"); } catch { return null; } });
  const [ans, setAns] = useState<Ans | null>(null);
  const [ansBusy, setAnsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`);
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as Result;
      setRes(data); sessionStorage.setItem("q", q); sessionStorage.setItem("res", JSON.stringify(data));
      // second temps : classement affiné par le modèle de relecture (quelques secondes), sans bloquer l'affichage rapide
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20&rr=1`).then((r) => r.json()).then((d: Result) => { setRes(d); sessionStorage.setItem("res", JSON.stringify(d)); }).catch(() => {});
      setAns(null); setAnsBusy(true);
      fetch(`/api/answer?q=${encodeURIComponent(q)}`).then((r) => r.json()).then(setAns).catch(() => setAns(null)).finally(() => setAnsBusy(false));
    } catch (ex) { setErr(String(ex)); } finally { setBusy(false); }
  }
  const open = (id: number, mode: "open" | "reveal") =>
    fetch(`/api/files/${id}/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });

  return (
    <section>
      <form onSubmit={run} className="searchbox">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Posez une question ou cherchez un document…" />
        <button disabled={busy}>{busy ? "Recherche…" : "Rechercher"}</button>
      </form>
      {err && <p className="warn">{err}</p>}
      {(ansBusy || ans) && (
        <div className="answer">
          <strong>Réponse</strong>
          {ansBusy && <p className="meta">Rédaction en cours…</p>}
          {ans?.answer && <p style={{ whiteSpace: "pre-wrap" }}>{ans.answer}</p>}
          {ans && !ans.answer && <p className="meta">{ans.reason}</p>}
          {ans?.sources.length ? <p className="meta">Sources : {ans.sources.map((s) => (
            <a key={s.n} href={`/api/files/${s.fileId}/raw`} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>[{s.n}] {s.title}</a>))}</p> : null}
          {ans && (ans.redactions > 0 || ans.blocked > 0 || ans.skippedConfidential > 0) &&
            <p className="meta">Protection : {ans.redactions} donnée(s) masquée(s), {ans.blocked + ans.skippedConfidential} extrait(s) exclu(s) de l'envoi à l'IA.</p>}
        </div>
      )}
      {res && <p className="meta">{res.hits.length} fichier(s) · {res.ms} ms · mode {res.mode}</p>}
      <ul className="hits">
        {res?.hits.map((h) => (
          <li key={h.fileId}>
            <div className="hit-head">
              <a href={`/api/files/${h.fileId}/raw`} target="_blank" rel="noreferrer" className="title">{h.title}</a>
              {h.page && <span className="chip">p. {h.page}</span>}
              {h.paths.length > 1 && <span className="chip" title={h.paths.join("\n")}>{h.paths.length} emplacements</span>}
            </div>
            <div className="path">{h.path}</div>
            <p className="snippet">{h.snippet}…</p>
            <div className="actions">
              <button onClick={() => open(h.fileId, "open")}>Ouvrir</button>
              <button onClick={() => open(h.fileId, "reveal")}>Afficher dans le dossier</button>
            </div>
          </li>
        ))}
      </ul>
      {res && !res.hits.length && <p>Aucun résultat.</p>}
    </section>
  );
}
