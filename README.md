# TripSaathi (V1 / M1)

Personal Travel Assistant — India beachhead. Installable as a PWA.  
Spine: Understand → Stitch market → Shortlist → Enquire → Learn

## Local setup (recommended)

```bash
# 1) Enter project
cd travel-assistant

# 2) Install
npm install

# 3) Database
npx prisma migrate dev

# 4) Run
npm run dev
```

Open http://localhost:3000

### Demo prompts
- December mein family ke saath 6 din Kashmir jaana hai, budget 60k
- Goa for 5 days, couple, around 50k, something peaceful
- Kerala relaxed trip, 6 days, family, under 70k

## Push to GitHub (from your laptop)

```bash
git init   # only if needed
git remote add origin git@github.com:YOUR_USER/YOUR_REPO.git
git checkout -b cursor/travel-assistant-m1-d5ad
git push -u origin cursor/travel-assistant-m1-d5ad
```

Or create repo in GitHub UI, then push this folder.

## Deploy to Vercel (from your laptop)

```bash
npm i -g vercel
vercel login
vercel
```

> Note: SQLite (`file:./dev.db`) is fine locally. For Vercel production, connect Postgres/Turso later — serverless can’t reliably write a local SQLite file.

## Stack
Next.js · TypeScript · Tailwind · Prisma · SQLite
