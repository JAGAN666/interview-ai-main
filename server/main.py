from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from server.model_manager import model_manager
import uvicorn
import os

app = FastAPI()

# Allow CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, lock this down
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    question: str
    skills_context: str = "General Engineering"
    conversation_history: list = []  # List of {"role": "user"|"assistant", "content": "..."}

@app.get("/")
def health_check():
    return {"status": "running", "model": "Mistral-7B"}

@app.post("/generate")
def generate_answer(req: GenerateRequest):
    try:
        print(f"Received question: {req.question} for skills: {req.skills_context}")
        print(f"Conversation history length: {len(req.conversation_history)}")
        answer = model_manager.generate_response(req.question, req.skills_context, req.conversation_history)
        return {"answer": answer}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/suggestions")
def get_suggestions(skills_context: str = "General Engineering"):
    try:
        print(f"Fetching suggestions for skills: {skills_context}")
        suggestions = model_manager.get_suggestions(skills_context)
        return {"suggestions": suggestions}
    except Exception as e:
        print(f"Suggestion Error: {e}")
        return {"suggestions": [
            "Tell me about your most challenging project.",
            "How do you handle data quality in large pipelines?",
            "What excites you about working at a robotics startup?"
        ]}

if __name__ == "__main__":
    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=True)
