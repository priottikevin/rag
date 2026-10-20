import os, time, json, sys, numpy as np, onnxruntime as ort
from pathlib import Path
from huggingface_hub import hf_hub_download, snapshot_download
from tokenizers import Tokenizer
import pypdfium2 as pdfium
# real chunks: ~200 words from sample PDFs
chunks=[]
for p in list(Path(os.environ['BENCH_ROOTS'].split(';')[0]).rglob('*.pdf'))[:60]:
    try:
        d=pdfium.PdfDocument(str(p)); t=" ".join(d[i].get_textpage().get_text_range() for i in range(min(len(d),6))); d.close()
    except Exception: continue
    w=t.split()
    for i in range(0,len(w)-200,200): chunks.append(" ".join(w[i:i+200]))
chunks=chunks[:160]; print("chunks",len(chunks))
M={
 "granite-97m-r2 q8avx2":("ibm-granite/granite-embedding-97m-multilingual-r2",["onnx/model_quint8_avx2.onnx"]),
 "e5-small fp32":("intfloat/multilingual-e5-small",["onnx/model.onnx"]),
 "embeddinggemma-300m q8":("onnx-community/embeddinggemma-300m-ONNX",["onnx/model_quantized.onnx","onnx/model_quantized.onnx_data"]),
 "qwen3-emb-0.6b int8":("onnx-community/Qwen3-Embedding-0.6B-ONNX",["onnx/model_int8.onnx"]),
}
only=sys.argv[1:] 
so=ort.SessionOptions(); so.intra_op_num_threads=4
for name,(repo,files) in M.items():
    if only and not any(o in name for o in only): continue
    try:
        paths=[hf_hub_download(repo,f) for f in files]
        tk=Tokenizer.from_pretrained(repo); tk.enable_truncation(256); tk.enable_padding()
        s=ort.InferenceSession(paths[0],so,providers=["CPUExecutionProvider"])
        names={i.name for i in s.get_inputs()}
        B=16; t0=time.perf_counter(); n=0
        for i in range(0,len(chunks),B):
            enc=tk.encode_batch(chunks[i:i+B])
            feed={"input_ids":np.array([e.ids for e in enc],dtype=np.int64),"attention_mask":np.array([e.attention_mask for e in enc],dtype=np.int64)}
            if "token_type_ids" in names: feed["token_type_ids"]=np.zeros_like(feed["input_ids"])
            if "position_ids" in names: feed["position_ids"]=np.tile(np.arange(feed["input_ids"].shape[1]),(len(enc),1)).astype(np.int64)
            for nm in names-set(feed):
                pass
            out=s.run(None,feed); n+=len(enc)
        dt=time.perf_counter()-t0
        print(f"{name}: {n/dt:.1f} chunks/s  -> 2M chunks = {2e6/(n/dt)/3600:.1f} h  (out {out[0].shape})",flush=True)
    except Exception as e: print(name,"ERR",str(e)[:200],flush=True)
