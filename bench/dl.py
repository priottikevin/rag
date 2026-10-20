from huggingface_hub import list_repo_files
for r in ["ibm-granite/granite-embedding-278m-multilingual","ibm-granite/granite-embedding-97m-multilingual-r2","intfloat/multilingual-e5-small","onnx-community/embeddinggemma-300m-ONNX","onnx-community/Qwen3-Embedding-0.6B-ONNX"]:
    try:
        f=list_repo_files(r); print(r, [x for x in f if x.endswith('.onnx') or 'onnx' in x.lower()][:12])
    except Exception as e: print(r,"ERR",str(e)[:80])
