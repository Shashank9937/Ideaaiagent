# Environment Variables Guide

## Backend (`backend/.env`)
Copy `backend/.env.example` to `backend/.env` and configure:

- `DATABASE_URL`: PostgreSQL DSN (`postgresql+asyncpg://...`).
- `OPENAI_API_KEY`: required for AI extraction and idea generation.
- `OPENAI_MODEL`: default `gpt-4o-mini`.
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`.
- `PRODUCTHUNT_ACCESS_TOKEN`.
- `TWITTER_BEARER_TOKEN`.
- `SUPABASE_JWT_SECRET`: enables backend token verification.
- `ALLOW_ANON_READ`: set `false` in production.

## Frontend (`frontend/.env.local`)
Copy `frontend/.env.example` to `frontend/.env.local` and configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL` (e.g. `http://localhost:8000/api/v1`)
