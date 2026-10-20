import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { SearchPage } from "./pages/SearchPage";
import { IngestPage } from "./pages/IngestPage";
import { OrganizePage } from "./pages/OrganizePage";
import { useIngest, jobCount } from "./ingest";

export function App() {
  const { state, online } = useIngest();
  const active = jobCount(state, ["pending", "running"]);
  const total = jobCount(state, ["pending", "running", "done"]);
  const pct = total ? Math.round(((total - active) / total) * 100) : 100;
  return (
    <div className="app">
      <header className="top">
        <strong className="brand">RAG local</strong>
        <nav>
          <NavLink to="/search">Recherche</NavLink>
          <NavLink to="/ingest">Dépôt{active > 0 && <span className="badge">{active}</span>}</NavLink>
          <NavLink to="/organize">Rangement</NavLink>
        </nav>
        <div className="status">
          {!online ? <span className="warn">API hors ligne</span> : state?.paused ? <span className="warn">Indexation en pause</span> : active > 0 ? (
            <span title="L'indexation continue en arrière-plan, même si vous changez de page">Indexation {pct}% · {active} tâches</span>
          ) : <span className="ok">Index à jour</span>}
          {active > 0 && <div className="bar"><div style={{ width: `${pct}%` }} /></div>}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/search" replace />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/ingest" element={<IngestPage />} />
          <Route path="/organize" element={<OrganizePage />} />
        </Routes>
      </main>
    </div>
  );
}
