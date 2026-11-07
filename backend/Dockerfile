FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

# Install Git and trusted CA certificates
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

#Install dep
COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir .

# Persistent application directories.
RUN mkdir -p /app/data /app/repositories \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", \
    "--host", "0.0.0.0", \
    "--port", "8000"]