# Travel Assistant — V1 Development Backlog

**STATUS: LOCKED — V1.0**  
Derived from locked User Stories. Build against this; scope changes need a revision bump.

**Product identity:** Personal Travel Assistant on top of the existing travel market.  
**Not:** marketplace, OTA, agent-onboarding-first platform.

**Spine:**  
Understand customer → Understand trip → Stitch existing market → Personalize → Shortlist → Connect → Learn

**Core abstractions:**  
`Conversation ≠ Travel Request ≠ Recommendation ≠ Trip`  
`Source Adapter → Normalized Travel Option`

**AI rule:** Assistant Layer → LLM → structured tools only (no uncontrolled DB/API access).

---

## Milestones

| ID | Milestone | Exit criteria |
|----|-----------|---------------|
| M1 | Useful shortlist | New customer talks to assistant → personalized shortlist from existing market data |
| M2 | Connect | Customer turns an option into enquiry/connect (quotation path) |
| M3 | Learn | Post-trip feedback updates memory → next shortlist improves |

---

## Backlog by sprint slice (suggested order)

Priority: **P0** = Core path · **P1** = Supporting minimum · **P2** = Later / out of V1

---

### Slice 0 — Foundations

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-001 | Project skeleton (Next.js + TS + Tailwind + Prisma + Postgres) | P0 | Single app, no microservices |
| BL-002 | Auth (email/OTP or social — pick one for V1) | P1 | Session → traveller identity |
| BL-003 | Core data models | P0 | User, Profile, Preference, Conversation, TravelRequest, TravelOption, Recommendation, Enquiry, Trip, Feedback, Source |
| BL-004 | Entity rules enforced in schema/services | P0 | Conversation can exist without Request; Request without Trip; Trip only after confirm |

---

### Slice 1 — Profile + Memory + Trust

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-010 | Create / continue profile (basics) | P0 | Name, home location, preferred language |
| BL-011 | Travel defaults | P0 | Party type, typical duration, budget range, preferred destinations |
| BL-012 | Preferences + avoidances | P0 | Hotel, pace, activities, food, nature, adventure, luxury/budget |
| BL-013 | Learned preferences: view + correct | P0 | US-016 — customer can edit what assistant learned |
| BL-014 | Conversation context memory | P0 | US-017 — don’t re-ask known relevant context |
| BL-015 | Temporary trip req vs long-term preference | P0 | US-018 — e.g. one-off budget does not overwrite profile budget |
| BL-016 | Profile updates from allowed signals only | P0 | US-014 — conversation + **search/view/save** + booking + feedback (no vague behaviour) |
| BL-017 | Basic history (trips/requests) | P1 | Thin list, not CRM |

---

### Slice 2 — Assistant chat

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-020 | Home = conversation-first UI | P0 | Greeting + chat thread |
| BL-021 | Use known profile in replies | P0 | Skip redundant questions when confident |
| BL-022 | Suggested prompts | P1 | Starter chips only |
| BL-023 | Upcoming / recent trip teasers | P1 | Link to basic trip record if exists |
| BL-024 | Quick actions | P1 | Few only; no dashboard clutter |
| BL-025 | Assistant → structured tools | P0 | LLM behind abstraction; tools for profile, search, recommend, enquiry, trip, memory |

---

### Slice 3 — Intent → Travel Request

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-030 | NL → structured understanding | P0 | intent, destination, dates, duration, travellers, budget, travelStyle, preferences, constraints, **confidence**, **missingInformation** |
| BL-031 | Ask only necessary missing fields | P0 | Driven by confidence + missingInformation |
| BL-032 | Persist Travel Request | P0 | Separate from Conversation messages |
| BL-033 | Map chat → optional request creation | P0 | Many conversations; few requests |

---

### Slice 4 — Market stitch (differentiator)

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-040 | Source Adapter interface | P0 | Contract: search(request) → raw → normalize |
| BL-041 | Normalized Travel Option model | P0 | Destination, duration, stay, transport, activities, price, inclusions, cancellation, source, freshness |
| BL-042 | First concrete adapter(s) | P0 | Start with 1–2 real sources (API and/or affiliate). Agent adapter optional, not required |
| BL-043 | Discovery layer orchestration | P0 | Fan-out adapters → collect → hand off to normalize |
| BL-044 | Dedupe / conflict handling | P0 | US-042 |
| BL-045 | Source + freshness on each option | P0 | US-043 — never imply live if stale |
| BL-046 | Graceful incomplete data | P0 | US-044 — honest gaps, no fake certainty |

---

### Slice 5 — Recommend + shortlist

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-050 | Rank using profile + request + options + feedback | P0 | Not “most popular” alone |
| BL-051 | Confidence-aware recommend UX | P0 | Low confidence → ask 1–2 details; high → lean on memory |
| BL-052 | Explain why each option fits | P0 | Short plain-language reason |
| BL-053 | Shortlist size ~3 | P0 | US-052 — not a search dump |
| BL-054 | Persist Recommendation set against Travel Request | P0 | Traceable for learning later |

---

### Slice 6 — Select → Enquiry / Connect (M2)

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-060 | Select option from shortlist | P0 | Creates Selected Option |
| BL-061 | Create enquiry to relevant provider/source | P0 | Primary V1 path |
| BL-062 | Enquiry / quotation status (basic) | P0 | pending / quoted / confirmed / closed |
| BL-063 | Direct booking via provider API | P2 | Only where cheap/clear; not V1 critical path |

---

### Slice 7 — Basic trip record (thin)

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-070 | Create Trip only after confirmed enquiry/booking | P1 | Not before |
| BL-071 | Trip fields: destination, dates, status, confirmed services | P1 | Minimum |
| BL-072 | Attach itinerary/documents only if source already provides them | P1 | No manual build requirement |
| BL-073 | Open trip from Home | P1 | Simple link |

---

### Slice 8 — Feedback → learn (M3)

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-080 | Post-trip feedback (ratings + liked/disliked) | P0 | |
| BL-081 | Apply feedback to long-term memory carefully | P0 | Respect temp vs permanent rules (US-018) |
| BL-082 | Signal capture: search / view / save | P0 | Explicit V1 behaviour signals for US-014 |

---

### Slice 9 — Conversational compare (supporting)

| ID | Story | Pri | Notes / acceptance (short) |
|----|--------|-----|----------------------------|
| BL-090 | Explain differences in chat | P1 | “A better hotel; B better activities” |
| BL-091 | Dedicated comparison screen | P2 | Do not overbuild in V1 |

---

## Explicitly out of V1 (do not schedule)

- During-trip intelligence  
- Complex multi-supplier booking orchestration  
- Deep supplier integrations as hard dependency  
- Agent portal / hotel admin / supplier marketplace  
- Own inventory / fleet  
- Loyalty, social, native apps, microservices  
- Heavy custom ML recommender  
- Full OTA / large comparison UI / full TMS  

---

## Definition of Done (V1)

- [ ] M1: shortlist from stitched market, personalized, ~3 options with reasons  
- [ ] M2: select → enquiry/connect with basic status  
- [ ] M3: feedback updates memory without poisoning profile from one-off trip constraints  
- [ ] Source Adapter pattern in place; at least one real adapter live  
- [ ] Conversation / Travel Request / Recommendation / Trip kept distinct  
- [ ] No agent portal, no owned inventory, no marketplace onboarding  

---

## Traceability (story → backlog)

| US | Backlog items |
|----|----------------|
| US-001 | BL-002 |
| US-010–013 | BL-010–012 |
| US-014 | BL-016, BL-082 |
| US-015 | BL-017 |
| US-016–018 | BL-013–015 |
| US-020–024 | BL-020–024 |
| US-030–033 | BL-030–033 |
| US-040–044 | BL-040–046 |
| US-050–052 | BL-050–054 |
| US-060–062 | BL-060–062 |
| US-063 | BL-063 (P2) |
| US-070–071 | BL-070–073 |
| US-080–081 | BL-080–081 |
| US-090–091 | BL-090–091 |

---

## Product principle (keep visible on every ticket)

> We are building a Personal Travel Assistant that sits on top of the existing travel market.  
> Usage stitches the market → supply connections grow → data grows → assistant improves → ecosystem emerges organically.
