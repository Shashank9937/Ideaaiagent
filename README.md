# Market War Radar - AI Founder Intelligence Engine

Production-ready full-stack starter that ingests founder pain signals from Reddit, Product Hunt, and Twitter/X, clusters market problems, generates startup ideas, scores validation potential, and exposes everything in a modern dashboard.

## Stack

- Frontend: Next.js App Router, Tailwind CSS, shadcn-style components, Supabase Auth (email)
- Backend: FastAPI, PostgreSQL (Supabase-compatible), OpenAI API, APScheduler jobs
- Deployment:
  - Frontend: Vercel (`frontend/vercel.json`)
  - Backend: Render (`render.yaml`)
  - Container: Root `Dockerfile`

## Project Structure

```text
.
├── backend
│   ├── app
│   │   ├── api
│   │   │   ├── deps.py
│   │   │   ├── router.py
│   │   │   └── routes
│   │   │       ├── admin.py
│   │   │       ├── clusters.py
│   │   │       ├── dashboard.py
│   │   │       ├── health.py
│   │   │       └── ideas.py
│   │   ├── core
│   │   │   └── config.py
│   │   ├── db
│   │   │   ├── init_db.py
│   │   │   └── session.py
│   │   ├── jobs
│   │   │   ├── scheduler.py
│   │   │   └── tasks.py
│   │   ├── models
│   │   │   ├── admin_filter.py
│   │   │   ├── cluster.py
│   │   │   ├── idea.py
│   │   │   ├── pain.py
│   │   │   └── post.py
│   │   ├── schemas
│   │   │   ├── admin.py
│   │   │   ├── cluster.py
│   │   │   ├── dashboard.py
│   │   │   ├── idea.py
│   │   │   ├── pain.py
│   │   │   └── post.py
│   │   ├── services
│   │   │   ├── ai
│   │   │   │   ├── idea_generator.py
│   │   │   │   ├── openai_client.py
│   │   │   │   ├── pain_extractor.py
│   │   │   │   └── validation.py
│   │   │   ├── clustering
│   │   │   │   └── cluster_engine.py
│   │   │   ├── collectors
│   │   │   │   ├── base.py
│   │   │   │   ├── producthunt_collector.py
│   │   │   │   ├── reddit_collector.py
│   │   │   │   └── twitter_collector.py
│   │   │   └── pipeline.py
│   │   └── main.py
│   ├── .env.example
│   ├── Dockerfile
│   ├── requirements.txt
│   └── tests
│       └── test_validation.py
├── frontend
│   ├── app
│   │   ├── (auth)/login/page.tsx
│   │   ├── (protected)/clusters/[id]/page.tsx
│   │   ├── (protected)/dashboard/page.tsx
│   │   ├── (protected)/ideas/[id]/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components
│   │   ├── dashboard
│   │   └── ui
│   ├── lib
│   │   ├── api.ts
│   │   ├── supabase
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── middleware.ts
│   ├── package.json
│   ├── tailwind.config.ts
│   └── vercel.json
├── Dockerfile
├── ENVIRONMENT.md
├── docker-compose.yml
└── render.yaml
```

## Core Capabilities

1. Data Collection Module
- Reddit via PRAW
- Product Hunt GraphQL API
- Twitter/X recent search API
- Stores platform posts in `posts`

2. Pain Extraction Agent
- OpenAI extraction (with fallback heuristics)
- Stores `pain_point`, `target_user`, `urgency_score`, `willingness_to_pay`, `existing_solutions` in `extracted_pains`

3. Problem Clustering Engine
- TF-IDF + agglomerative clustering
- Creates `problem_clusters`
- Tracks cluster trends (7d/30d)

4. Idea Generator
- For each cluster:
  - 3 SaaS ideas
  - 1 AI automation idea
  - 1 B2B enterprise idea
- Includes ICP, revenue model, MVP features, pricing estimate, GTM, and launch plan

5. Validation Scoring
- Weighted score (0-100):
  - pain intensity
  - frequency
  - budget size
  - competition level
  - speed to MVP
  - scalability

6. Dashboard UI
- KPI tiles
- Top clusters
- Trending signals
- Highest-scoring ideas
- Revenue model summary
- Quick launch MVP plan
- Cluster detail and idea detail pages

7. Admin Panel
- Manual keyword include/exclude
- Geo filter (`INDIA` / `GLOBAL`)
- Industry filter (SaaS, Energy, B2B, AI, Logistics)
- Trigger scraping run and trend recalculation

8. Background Jobs
- Scrape pipeline every 6 hours
- Trend recompute daily

## Local Setup

### 1) Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 2) Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### 3) Docker Compose

```bash
docker compose up --build
```

## API Endpoints

- `GET /api/v1/health`
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/clusters`
- `GET /api/v1/clusters/{cluster_id}`
- `GET /api/v1/ideas`
- `GET /api/v1/ideas/{idea_id}`
- `GET /api/v1/admin/filters`
- `PUT /api/v1/admin/filters`
- `POST /api/v1/admin/run-scrape`
- `POST /api/v1/admin/recalculate-trends`

## Deploy

### Frontend -> Vercel
- Root directory: `frontend`
- Framework: Next.js
- Env vars from `frontend/.env.example`

### Backend -> Render
- Use included `render.yaml`
- Set secret env vars in Render dashboard
- Points to root `Dockerfile`

## Notes

- Set `ALLOW_ANON_READ=false` in production.
- For Supabase Auth verification on backend, set `SUPABASE_JWT_SECRET`.
- Scheduler runs inside FastAPI process; for larger scale, move jobs into a dedicated worker service.
