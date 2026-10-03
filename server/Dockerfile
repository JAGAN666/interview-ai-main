# Production Dockerfile for Interview AI Backend
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies for llama-cpp (if still needed, though cloud version uses Gemini)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

# Set environment variables
ENV USE_GEMINI=true
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
