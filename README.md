# Sahayatri — Personal Travel Assistant (V1)

**Status:** V1.0 locked spine — M1 in progress

> We are not building a travel marketplace or OTA.  
> We are building a **Personal Travel Assistant** that sits on top of the existing travel market — for the customer’s benefit.

## Spine

Understand customer → Understand trip → Stitch existing market → Personalize → Shortlist → Connect → Learn

## Abstractions entities

`Conversation ≠ Travel Request ≠ Recommendation ≠ Trip`  
`Source Adapter → Normalized Travel Option`

## Beachhead

- Market focus: **India** (`MARKET_FOCUS=IN`)
- Nothing hard-coded in the UI as supply — options come from **source adapters**
- First adapter: `india-market-catalog` reading `data/sources/india-market-catalog.json` (replace with live API adapters later)

## Run locally

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## M1 demo prompts

- `December mein family ke saath 6 din Kashmir jaana hai, budget 60k`
- `Goa for 5 days, couple, around 50k, something peaceful`
- `Kerala relaxed trip, 6 days, family, under 70k`

## Stack

Next.js · TypeScript · Tailwind · Prisma · SQLite (swap to Postgres later via `DATABASE_URL`)
