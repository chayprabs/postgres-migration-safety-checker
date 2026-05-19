# Self-hosted Docker

Run the Authos web app (PostgreSQL Migration Safety Checker) on your own network.

## Requirements

- Docker and Docker Compose
- `NEXT_PUBLIC_SITE_URL` set to the origin users will open

## Quick start

```bash
docker compose up --build
```

Open `http://localhost:3000/tools/postgres-migration-safety-checker`.

## Production

Set build args and environment:

```bash
NEXT_PUBLIC_SITE_URL=https://migrations.example.com docker compose up --build -d
```

The image uses Next.js `standalone` output. Analysis still runs in the user's browser; the container only serves the static/SSR app shell.
