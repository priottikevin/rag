"""Worker Python : protocole JSON-lines sur stdin/stdout (une requête par ligne -> une réponse par ligne).
Ops : ping | extract | ocr | embed.  Les logs vont sur stderr.  Voir docs/ARCHITECTURE.md §1/§4."""
import sys, os, json, re, time, traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "data" / "models"
os.environ.setdefault("HF_HOME", str(MODELS))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

sys.stdin.reconfigure(encoding="utf-8"); sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")

def log(*a): print(*a, file=sys.stderr, flush=True)

# ---------- extraction ----------
def clean(t: str) -> str:
    t = t.replace("\x00", " ").replace("\uf028", " ")
    return re.sub(r"[ \t\r\f\v]+", " ", re.sub(r"\n{3,}", "\n\n", t)).strip()

def x_pdf(p):
    import pypdfium2 as pdfium
    d = pdfium.PdfDocument(p); pages = []
    for i in range(len(d)):
        pg = d[i]; tp = pg.get_textpage(); pages.append({"page": i + 1, "text": clean(tp.get_text_range())}); tp.close(); pg.close()
    d.close(); return pages

def x_docx(p):
    import docx
    d = docx.Document(p); parts = [x.text for x in d.paragraphs if x.text.strip()]
    for tb in d.tables:
        for r in tb.rows:
            cells = [c.text.strip() for c in r.cells if c.text.strip()]
            if cells: parts.append(" | ".join(cells))
    return [{"page": None, "text": clean("\n".join(parts))}]

def x_xlsx(p):
    import openpyxl
    wb = openpyxl.load_workbook(p, read_only=True, data_only=True); out = []
    for ws in wb.worksheets:
        rows = []
        for r in ws.iter_rows(values_only=True):
            v = [("" if c is None else str(c)) for c in r]
            while v and not v[-1]: v.pop()
            if any(v): rows.append(" | ".join(v))
        if rows: out.append({"page": None, "sheet": ws.title, "text": clean("## " + ws.title + "\n" + "\n".join(rows))})
    wb.close(); return out

def x_doc(p):  # parseur provisoire (I-04b : piece table à écrire)
    import olefile
    o = olefile.OleFileIO(p)
    if not o.exists("WordDocument"): return [{"page": None, "text": ""}]
    b = o.openstream("WordDocument").read()
    cands = [b.decode("latin-1", "ignore"), b.decode("utf-16le", "ignore")]
    t = max(cands, key=lambda x: len(re.findall(r"[A-Za-zÀ-ÿ]{3,}", x)))
    return [{"page": None, "text": clean(" ".join(re.findall(r"[\w\sÀ-ÿ.,;:!?'()€%/@-]{20,}", t)))}]

def x_text(p):
    raw = Path(p).read_bytes()
    for enc in ("utf-8-sig", "cp1252"):
        try: return [{"page": None, "text": clean(raw.decode(enc))}]
        except UnicodeDecodeError: pass
    return [{"page": None, "text": clean(raw.decode("latin-1"))}]

EXTRACTORS = {".pdf": ("pdf", x_pdf), ".docx": ("docx", x_docx), ".xlsx": ("xlsx", x_xlsx), ".xlsm": ("xlsx", x_xlsx), ".doc": ("doc", x_doc),
              ".txt": ("text", x_text), ".csv": ("text", x_text), ".md": ("text", x_text), ".json": ("text", x_text), ".xml": ("text", x_text), ".html": ("text", x_text), ".htm": ("text", x_text), ".log": ("text", x_text)}
IMAGES = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp", ".gif"}

def op_extract(req):
    p = req["path"]; ext = Path(p).suffix.lower()
    if ext in IMAGES: return {"kind": "image", "pages": [], "quality": "empty", "needs_ocr": True}
    if ext not in EXTRACTORS: return {"kind": "unsupported", "pages": [], "quality": "empty", "needs_ocr": False}
    kind, fn = EXTRACTORS[ext]; pages = fn(p); total = sum(len(x["text"]) for x in pages)
    quality = "native" if total >= 50 else "empty"
    return {"kind": kind, "pages": pages, "quality": quality, "page_count": len(pages), "needs_ocr": quality == "empty" and kind == "pdf"}

# ---------- OCR ----------
_ocr = None
def get_ocr():
    global _ocr
    if _ocr is None:
        from rapidocr import RapidOCR
        _ocr = RapidOCR()
    return _ocr

def ocr_img(arr):
    r = get_ocr()(arr)
    return clean(" ".join(r.txts)) if r is not None and r.txts else ""

def op_ocr(req):
    import numpy as np
    from PIL import Image
    p = req["path"]; ext = Path(p).suffix.lower(); maxpx = int(req.get("max_px", 1600)); pages = []
    if ext == ".pdf":
        import pypdfium2 as pdfium
        d = pdfium.PdfDocument(p)
        for i in range(min(len(d), int(req.get("max_pages", 60)))):
            im = d[i].render(scale=150 / 72).to_pil().convert("RGB"); im.thumbnail((maxpx, maxpx))
            pages.append({"page": i + 1, "text": ocr_img(np.array(im))})
        d.close()
    else:
        im = Image.open(p); im.thumbnail((maxpx, maxpx)); pages.append({"page": None, "text": ocr_img(np.array(im.convert("RGB")))})
    total = sum(len(x["text"]) for x in pages)
    return {"pages": pages, "quality": "ocr" if total >= 20 else "empty"}

# ---------- embeddings (multilingual-e5-small, ONNX) ----------
_emb = {}
def get_emb():
    if not _emb:
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        from tokenizers import Tokenizer
        repo = "intfloat/multilingual-e5-small"
        so = ort.SessionOptions(); so.intra_op_num_threads = int(os.environ.get("EMBED_THREADS", "4"))
        _emb["s"] = ort.InferenceSession(hf_hub_download(repo, "onnx/model.onnx"), so, providers=["CPUExecutionProvider"])
        tk = Tokenizer.from_pretrained(repo); tk.enable_truncation(256); tk.enable_padding(); _emb["tk"] = tk
        _emb["names"] = {i.name for i in _emb["s"].get_inputs()}
    return _emb

def op_embed(req):
    import numpy as np
    e = get_emb(); prefix = "query: " if req.get("mode") == "query" else "passage: "
    texts = [prefix + t for t in req["texts"]]; out = []
    for i in range(0, len(texts), 16):
        enc = e["tk"].encode_batch(texts[i:i + 16])
        ids = np.array([x.ids for x in enc], dtype=np.int64); am = np.array([x.attention_mask for x in enc], dtype=np.int64)
        feed = {"input_ids": ids, "attention_mask": am}
        if "token_type_ids" in e["names"]: feed["token_type_ids"] = np.zeros_like(ids)
        h = e["s"].run(None, feed)[0]; v = (h * am[..., None]).sum(1) / am.sum(1, keepdims=True)
        v = v / np.linalg.norm(v, axis=1, keepdims=True); out.extend(v.round(5).tolist())
    return {"vectors": out}

# ---------- reranker (mmarco-mMiniLMv2, cross-encoder multilingue, Apache 2.0) ----------
_rr = {}
def op_rerank(req):
    import numpy as np
    if not _rr:
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        from tokenizers import Tokenizer
        repo = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
        so = ort.SessionOptions(); so.intra_op_num_threads = int(os.environ.get("EMBED_THREADS", "4"))
        _rr["s"] = ort.InferenceSession(hf_hub_download(repo, "onnx/model_O2.onnx"), so, providers=["CPUExecutionProvider"])
        tk = Tokenizer.from_pretrained(repo); tk.enable_truncation(384); tk.enable_padding(); _rr["tk"] = tk
        _rr["names"] = {i.name for i in _rr["s"].get_inputs()}
    out = []; texts = req["texts"]
    for i in range(0, len(texts), 8):
        enc = _rr["tk"].encode_batch([(req["query"], t) for t in texts[i:i + 8]])
        feed = {"input_ids": np.array([e.ids for e in enc], dtype=np.int64), "attention_mask": np.array([e.attention_mask for e in enc], dtype=np.int64)}
        if "token_type_ids" in _rr["names"]: feed["token_type_ids"] = np.array([e.type_ids for e in enc], dtype=np.int64)
        lg = _rr["s"].run(None, feed)[0].reshape(len(enc), -1)[:, -1]
        out.extend(float(x) for x in lg)
    return {"scores": out}

OPS = {"rerank": op_rerank, "ping": lambda r: {"pong": True}, "extract": op_extract, "ocr": op_ocr, "embed": op_embed}

def main():
    log("worker ready")
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        t0 = time.time()
        try: req = json.loads(line)
        except json.JSONDecodeError as ex:
            log("bad json line:", ex); continue
        try: res = {"id": req["id"], "ok": True, "result": OPS[req["op"]](req), "ms": int((time.time() - t0) * 1000)}
        except Exception as ex: res = {"id": req["id"], "ok": False, "error": f"{type(ex).__name__}: {ex}", "trace": traceback.format_exc()[-600:]}
        sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n"); sys.stdout.flush()

if __name__ == "__main__":
    main()
