import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../../..");
const py = resolve(root, "workers/python/.venv/Scripts/python.exe");
const script = resolve(root, "workers/python/worker.py");

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

/** Processus Python persistant, protocole JSON-lines. Redémarre automatiquement s'il meurt. */
export class PyWorker {
  private proc?: ChildProcessWithoutNullStreams;
  private pending = new Map<number, Pending>();
  private seq = 0;
  constructor(private name: string, private env: Record<string, string> = {}) {}

  private start() {
    const p = spawn(py, ["-u", script], { env: { ...process.env, PYTHONUTF8: "1", ...this.env } });
    createInterface({ input: p.stdout }).on("line", (line) => {
      if (!line.startsWith("{")) return; // ignore tout bruit non-JSON
      try {
        const msg = JSON.parse(line);
        const pend = this.pending.get(msg.id);
        if (!pend) return;
        this.pending.delete(msg.id);
        msg.ok ? pend.resolve(msg.result) : pend.reject(new Error(msg.error));
      } catch { /* ligne invalide */ }
    });
    p.stderr.on("data", () => {});
    p.on("exit", () => {
      for (const [, pend] of this.pending) pend.reject(new Error(`worker ${this.name} terminé`));
      this.pending.clear();
      this.proc = undefined;
    });
    this.proc = p;
  }

  call<T = any>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.proc) this.start();
    const id = ++this.seq;
    return new Promise<T>((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.proc!.stdin.write(JSON.stringify({ id, op, ...args }) + "\n");
    });
  }

  stop() { this.proc?.kill(); }
}
