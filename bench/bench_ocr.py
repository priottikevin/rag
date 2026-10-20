import os, json, time, sys
from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image
from rapidocr import RapidOCR
ocr=RapidOCR()
res=json.load(open('extract_results.json'))
scans=[x['path'] for x in res if x['ext']=='.pdf' and x['chars']<50 and not x['err']][:5]
imgs=[str(p) for p in Path(os.environ['BENCH_ROOTS'].split(';')[-1]).rglob('*.jpg')][:4]
def run(img,label):
    t0=time.perf_counter(); r=ocr(img); dt=time.perf_counter()-t0
    txt=" ".join(r.txts) if r and r.txts else ""
    print(f"{label}: {dt:.1f}s, {len(txt)} chars | {txt[:140]!r}",flush=True)
for p in []:
    d=pdfium.PdfDocument(p); im=d[0].render(scale=150/72).to_pil().convert("RGB"); print(Path(p).name,len(d),"pages",im.size)
    import numpy as np; run(np.array(im),"  page1 @150dpi")
for p in imgs:
    im=Image.open(p); print(Path(p).name,im.size,Path(p).stat().st_size//1024,"KB")
    im.thumbnail((1600,1600)); import numpy as np; run(np.array(im.convert("RGB")),"  resized<=1600px")
