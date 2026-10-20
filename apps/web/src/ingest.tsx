import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface IngestState {
  paused: boolean;
  jobs: { kind: string; status: string; n: number }[];
  documents: { documents: number; lexical: number; embedded: number };
  files: { status: string; n: number }[];
  failures: { id: number; kind: string; error: string | null }[];
}

const Ctx = createContext<{ state: IngestState | null; online: boolean }>({ state: null, online: false });
export const useIngest = () => useContext(Ctx);

/** Une seule connexion SSE pour toute l'app : l'état de l'ingestion reste visible (barre du haut) quelle que soit la page.
 *  Le traitement lui-même tourne côté serveur : il continue même si on ferme l'onglet. */
export function IngestProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IngestState | null>(null);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const es = new EventSource("/api/ingest/events");
    es.onmessage = (e) => { setState(JSON.parse(e.data)); setOnline(true); };
    es.onerror = () => setOnline(false);
    return () => es.close();
  }, []);
  return <Ctx.Provider value={{ state, online }}>{children}</Ctx.Provider>;
}

export function jobCount(s: IngestState | null, status: string[], kind?: string) {
  return (s?.jobs ?? []).filter((j) => status.includes(j.status) && (!kind || j.kind === kind)).reduce((a, j) => a + j.n, 0);
}
