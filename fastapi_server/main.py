from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import torch
from transformers import pipeline

app = FastAPI(title="Arn-Hai ToS Classifier API")

# อนุญาตให้ Browser Extension เรียก API ได้ (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ตั้งค่า Model ที่ต้องการใช้งาน
MODEL_NAME = "XChava/arn-hai-tos-mdeberta-v1"

print(f"Loading model {MODEL_NAME}...")
# ตรวจสอบว่ามีการ์ดจอหรือไม่ ถ้าไม่มีให้รันด้วย CPU (device=-1)
device = 0 if torch.cuda.is_available() else -1
classifier = pipeline("text-classification", model=MODEL_NAME, device=device)
print("Model loaded successfully. Ready to receive requests!")

# กำหนด Schema สำหรับรับข้อมูล
class ClassifyRequest(BaseModel):
    texts: List[str]

@app.post("/classify")
async def classify_text(request: ClassifyRequest):
    if not request.texts:
        return {"results": []}
    
    # ทำการ Classify
    predictions = classifier(request.texts, top_k=1)
    
    results = []
    for pred in predictions:
        # กรณี top_k=1 โมเดลอาจจะคืนค่าเป็น list ซ้อน list
        best = pred[0] if isinstance(pred, list) else pred
            
        results.append({
            "label": best["label"],
            "score": best["score"]
        })
        
    return {"results": results}
