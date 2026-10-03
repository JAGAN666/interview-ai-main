# Interview AI Walkthrough (Mistral + Dual Brain)

You have successfully upgraded your assistant to specific **YOUR** experience!

## 🚀 Getting Started

1. **Frontend**: `http://localhost:5173`
2. **Backend**: `http://localhost:8000`

## 🧠 Architecture: The "Dual Brain"

This version uses a sophisticated 3-step process to answer every question:

### 1. The Personal Index (Resume RAG)
*   **Source**: Your PDFs (`Jagannath.pdf`, `r.pdf`) chunked into 500-character details.
*   **Role**: Provides the *content* of the answer (projects, metrics, skills).

### 2. The Technical Index (SQL Knowledge Base)
*   **Source**: A dedicated database of technical patterns.
*   **Role**: Provides the *structure* of the answer (e.g., "Use Token Bucket for Rate Limiting").

### 3. The Synthesis Engine (Mistral-7B)
*   **Technique**: **Few-Shot Prompting**. We trick the AI into thinking it has *already* been acting as the candidate for 10 minutes.
*   **Optimization**:
    *   `n_ctx=2048`: Prevents context overflow.
    *   `n_batch=128`: PREVENTS random crashes on Mac.
    *   `f16_kv=True`: Uses 50% less RAM for memory cache.

## 📝 Example
**User**: "Who are you?"
**AI**: "I am Jagannath, a software engineer..." (No longer says "I am an AI").

**User**: "How would you design a Rate Limiter?"
**AI**: "I would design a Rate Limiter using the **Token Bucket algorithm**... In my previous project **[Project X]**, I implemented this using **Redis**..."

## 🛠️ Performance
*   **Metal Acceleration**: Uses your Mac's GPU.
*   **Stability**: **Crash-Proof Config** applied.
