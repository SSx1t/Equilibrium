# Portable container for the Equilibrium FastAPI backend.
# Works on Railway, Fly.io, Render, Cloud Run, or any container host.
#   docker build -t equilibrium-api .
#   docker run -p 8000:8000 -e GEMINI_API_KEY=... equilibrium-api
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY data ./data

EXPOSE 8000

# Most PaaS inject $PORT; default to 8000 locally.
ENV PORT=8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
