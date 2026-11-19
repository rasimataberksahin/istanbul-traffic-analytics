# syntax=docker/dockerfile:1

FROM python:3.12.4-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY etl/pyproject.toml etl/
COPY etl/src etl/src
# Editable install keeps the package next to data/ and database/, which it finds relative to itself.
RUN pip install -e ./etl

# The package resolves data/, database/ and docs/ relative to the project root.
COPY database database
RUN useradd --create-home --uid 10001 etl && mkdir -p data/raw data/processed docs/etl-runs \
    && chown -R etl:etl /app
USER etl

ENTRYPOINT ["python", "-m", "traffic_etl.run"]
CMD ["--from", "2024-10", "--to", "2024-10"]
