import json, re, math, time, sys, numpy as np, onnxruntime as ort
from pathlib import Path
from collections import Counter
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer
exec(open('bench_extract.py',encoding='utf-8').read().split("res=[]")[0])
fs=[p for r in ROOTS for p in Path(r).rglob('*') if p.is_file() and p.suffix.lower() in ('.pdf','.docx','.xlsx') and not p.name.startswith('~$')]
chunks=[]  # (file, text)
for p in fs:
    try: t,_=H[p.suffix.lower()](str(p))
    except Exception: continue
    w=re.sub(r'\s+',' ',t).split()
    if not w: continue
    for i in range(0,max(1,len(w)-30),150):
        chunks.append((p.name,"%s | %s : %s"%(p.parent.name,p.name," ".join(w[i:i+180]))))
print("files",len(fs),"chunks",len(chunks),flush=True)
Q=json.load(open('queries.json',encoding='utf-8'))
def ok(fn,exp): return any(e.lower() in fn.lower() for e in exp)
def evalrank(scores,name):  # scores: [nq, nchunks]
    r5=r10=mrr=0
    for qi,q in enumerate(Q):
        order=np.argsort(-scores[qi]); seen=[]; 
        for j in order:
            f=chunks[j][0]
            if f not in seen: seen.append(f)
            if len(seen)>=10: break
        pos=next((i for i,f in enumerate(seen) if ok(f,q['exp'])),None)
        if pos is not None:
            mrr+=1/(pos+1); r5+=pos<5; r10+=pos<10
    n=len(Q); print(f"{name:34s} recall@5={r5/n:.2f} recall@10={r10/n:.2f} MRR={mrr/n:.2f}",flush=True)
# BM25
tok=lambda s:[x for x in re.findall(r'\w+',s.lower()) if len(x)>1]
import unicodedata
strip=lambda s:''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')
docs=[tok(strip(c[1])) for c in chunks]; N=len(docs); avg=sum(map(len,docs))/N
df=Counter(w for d in docs for w in set(d)); tfs=[Counter(d) for d in docs]
def bm25(q):
    qs=tok(strip(q)); s=np.zeros(N)
    for w in set(qs):
        if w not in df: continue
        idf=math.log(1+(N-df[w]+.5)/(df[w]+.5))
        for j,tf in enumerate(tfs):
            f=tf.get(w,0)
            if f: s[j]+=idf*f*2.2/(f+1.2*(0.25+0.75*len(docs[j])/avg))
    return s
B=np.array([bm25(q['q']) for q in Q]); evalrank(B,"BM25 seul")
so=ort.SessionOptions(); so.intra_op_num_threads=4
def embed(repo,f,pool,qp,dp,tag):
    cache=Path(f"emb_{tag}.npy")
    tk=Tokenizer.from_pretrained(repo); tk.enable_truncation(256); tk.enable_padding()
    s=ort.InferenceSession(hf_hub_download(repo,f),so,providers=["CPUExecutionProvider"]); names={i.name for i in s.get_inputs()}
    def run(texts):
        out=[]
        for i in range(0,len(texts),16):
            enc=tk.encode_batch(texts[i:i+16]); ids=np.array([e.ids for e in enc],dtype=np.int64); am=np.array([e.attention_mask for e in enc],dtype=np.int64)
            feed={"input_ids":ids,"attention_mask":am}
            if "token_type_ids" in names: feed["token_type_ids"]=np.zeros_like(ids)
            h=s.run(None,feed)[0]
            v=h[:,0] if pool=="cls" else (h*am[...,None]).sum(1)/am.sum(1,keepdims=True)
            out.append(v/np.linalg.norm(v,axis=1,keepdims=True))
        return np.vstack(out)
    if cache.exists(): D=np.load(cache)
    else:
        t0=time.time(); D=run([dp+c[1] for c in chunks]); np.save(cache,D); print(tag,"embed",round(time.time()-t0),"s",flush=True)
    Qe=run([qp+q['q'] for q in Q]); return Qe@D.T
def rrf(*S,k=60):
    out=np.zeros_like(S[0])
    for s in S:
        rk=np.argsort(np.argsort(-s,axis=1),axis=1); out+=1/(k+rk+1)
    return out
G=embed("ibm-granite/granite-embedding-97m-multilingual-r2","onnx/model_quint8_avx2.onnx","cls","","","granite"); evalrank(G,"Granite R2 seul")
E=embed("intfloat/multilingual-e5-small","onnx/model.onnx","mean","query: ","passage: ","e5"); evalrank(E,"e5-small seul")
evalrank(rrf(B,G),"Hybride BM25+Granite (RRF)"); evalrank(rrf(B,E),"Hybride BM25+e5 (RRF)"); evalrank(rrf(B,G,E),"Hybride BM25+Granite+e5")
