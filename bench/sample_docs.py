import json, random, re, sys
sys.argv=['x']
exec(open('bench_extract.py',encoding='utf-8').read().split("res=[]")[0])
random.seed(7)
fs=[p for r in ROOTS for p in Path(r).rglob('*') if p.is_file() and p.suffix.lower() in ('.pdf','.docx','.xlsx') and not p.name.startswith('~$')]
random.shuffle(fs); out=[]
for p in fs:
    try: t,_=H[p.suffix.lower()](str(p))
    except Exception: continue
    t=re.sub(r'\s+',' ',t).strip()
    if len(t)<600: continue
    out.append((str(p),t[:450]))
    if len(out)>=40: break
for i,(p,t) in enumerate(out): print(f"[{i}] {p}\n    {t}\n")
