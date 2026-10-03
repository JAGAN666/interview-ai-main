# Architecture & Workflow: specialized Interview AI

## 1. High-Level Architecture

```mermaid
graph TD
    User[User (Frontend)] -->|Voice/Text| API[FastAPI Backend]
    
    subgraph "The Brain (Local LLM)"
        Model[Mistral-7B-Instruct (GGUF)]
        Adapter[Prompt Engineering Layer]
    end
    
    subgraph "Knowledge Bases"
        ResumeDB[(Resume Vector Store)]
        InterviewDB[(SQL Interview Knowledge Base)]
    end
    
    API -->|1. Fetch User Context| ResumeDB
    API -->|2. Fetch Technical Context| InterviewDB
    
    ResumeDB -->|Retrieved: "User implemented Kafka..."| Adapter
    InterviewDB -->|Retrieved: "System Design for Twitter..."| Adapter
    
    Adapter -->|Constructed Prompt| Model
    Model -->|Streaming Response| API
```

## 2. Components

### A. The Model: `Mistral-7B-Instruct-v0.3` (Quantized)
*   **Why**: Best-in-class performance for 7B parameters.
*   **Format**: `GGUF` (4-bit or 5-bit quantization).
*   **Engine**: `llama-cpp-python` (Optimized for Apple Silicon / Metal).
*   **Reasoning**: `TinyLlama` was too small. Mistral handles complex logic and prolonged reasoning (like System Design) much better.

### B. Resume RAG (User Context)
*   **Input**: `r.pdf`, `Jagannath.pdf`.
*   **Method**: Sliding Window Chunking + FAISS (Already implemented).
*   **Goal**: "I am YOU". Provides the *personal* anecdotes.

### C. Interview Knowledge Base (General Context)
*   **Input**:
    *   LeetCode Patterns (HashMaps, Two Pointers).
    *   System Design Templates (Load Balancers, CAP Theorem).
    *   Glassdoor Q&A / STAR Examples.
*   **Method**: **SQLite Database (SQL)**.
    *   *Why SQL?* Structured retrieval. If the user is asked "Design Twitter", we query the `system_design` table for the "Social Network Schema" entry specifically, ensuring high-quality, structured guidance (better than fuzzy vector search for precise templates).

## 3. Workflow (The "Run" Loop)

1.  **Input**: User asks "How would you design a rate limiter?"
2.  **Classification**: Backend detects topic = `System Design`.
3.  **Retrieval 1 (Resume)**: Search FAISS for "rate limiter".
    *   *Result*: "Used Redis Rate Limiter in Project X."
4.  **Retrieval 2 (Knowledge SQL)**: Query `interview_db` for `topic='rate_limiter'`.
    *   *Result*: "Token Bucket Algorithm, Leaky Bucket, Distributed Redis implementation."
5.  **Synthesis**:
    *   **System Prompt**: "You are an Expert Engineer. Combine the candidate's experience (Redis) with standard industry patterns (Token Bucket)."
    *   **Generation**: "I would implement a Token Bucket algorithm using Redis... In my previous project [Project X], I actually used a similar pattern..."

## 4. Implementation Steps
1.  **Upgrade Model**: Install `llama-cpp-python` and download `mistral-7b-instruct-v0.2.Q4_K_M.gguf` (~4GB).
2.  **Build Knowledge DB**: Create `interview_data.db` (SQLite) and seed it with LeetCode/System Design data.
3.  **Update Logic**: Modify `main.py` to route queries to both DBs.
