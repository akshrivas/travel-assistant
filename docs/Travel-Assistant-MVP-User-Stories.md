# Travel Assistant — MVP User Stories

**STATUS: LOCKED — V1.0**  
Locked for development backlog. Changes only via explicit revision (V1.1+).

**Philosophy:** V1 = Personal Travel Assistant + existing market stitching.  
Not a full travel platform. Ecosystem emerges later.

**Primary user:** Traveller

---

## Priority legend

| Tag | Meaning |
|-----|---------|
| 🟢 CORE | Build now — defines the product |
| 🟡 SUPPORTING | Minimum viable version only |
| 🔴 LATER | Explicitly out of V1 / Phase 2+ |

---

## Milestones (success definition)

**Milestone #1**  
A new customer talks to the assistant and gets a genuinely useful, personalized travel shortlist using existing market information.

**Milestone #2**  
Customer can turn one of those options into an enquiry / connect (booking where easy later).

**Milestone #3**  
After the trip, the system learns and becomes more useful next time.

---

## Entity distinction (architecture)

These are **three different things**:

```
Conversation
     ↓
Travel Request
     ↓
Recommendation(s)
     ↓
Selected Option
     ↓
Enquiry / Booking
     ↓
Trip
```

- Customer may chat many times (Conversation).
- Only some chats become Travel Requests.
- Only some requests become a Trip.

---

## Final MVP spine

1. Auth  
2. Customer Profile + Memory  
3. Assistant Chat  
4. Intent / Request Understanding  
5. Travel Request  
6. Existing Market Search  
7. Normalize Travel Options  
8. Personalize / Recommend (with confidence)  
9. Customer selects  
10. Enquiry / Connect  
11. Simple Trip Workspace  
12. Feedback  
13. Profile / Memory update  

---

# 🟢 CORE — build now

---

## Epic A — Auth (thin)

**US-001** 🟡 SUPPORTING (minimum)  
As a traveller, I want to sign in simply (email/OTP or social), so that I can use the assistant and keep my profile and memory.

---

## Epic B — Customer Profile, Memory & Trust

**US-010** 🟢  
As a traveller, I want to create or continue a travel profile, so that the assistant doesn’t start from zero.

**US-011** 🟢  
As a traveller, I want basics stored (name, home location, preferred language), so that replies feel personal.

**US-012** 🟢  
As a traveller, I want travel defaults (party type, typical duration, budget range, preferred destinations), so that planning is faster.

**US-013** 🟢  
As a traveller, I want preferences and avoidances saved (hotel, pace, activities, food, nature, adventure, luxury/budget), so that options match me.

**US-014** 🟢  
As a traveller, I want the system to update my profile from conversation, **explicit V1 behaviour signals** (search / view / save of options), bookings, and feedback — not only forms — so that memory improves over time without vague “behaviour tracking” scope.

**US-015** 🟡  
As a traveller, I want past trips / bookings / feedback to appear in my history at a basic level, so that recommendations can use them.

**US-016** 🟢  
As a traveller, I want to see and correct important preferences the assistant has learned about me, so that my profile remains accurate.

**US-017** 🟢  
As a traveller, I want the assistant to remember relevant context from previous conversations, so that I don’t have to repeat myself.

**US-018** 🟢 *(critical)*  
As a traveller, I want the assistant to distinguish between temporary trip requirements and long-term preferences, so that one trip doesn’t permanently change my profile incorrectly.

Example: “Is baar budget ₹30k hai” ≠ permanent budget is ₹30k.

---

## Epic C — Assistant Chat (primary interface)

**US-020** 🟢  
As a traveller, I want to chat in natural language on Home, so that I can describe a trip without forms.

**US-021** 🟢  
As a traveller, I want the assistant to use what it already knows about me, so that it doesn’t re-ask everything.

**US-022** 🟡  
As a traveller, I want suggested prompts, so that I know how to start.

**US-023** 🟡  
As a traveller, I want to see upcoming and recent trips briefly on Home, so that I can continue or revisit.

**US-024** 🟡  
As a traveller, I want a few quick actions on Home, so that common next steps are easy.

---

## Epic D — Intent & Travel Request understanding

**US-030** 🟢  
As a traveller, I want the assistant to understand my travel **intent** and extract relevant trip requirements from natural language, so that I don’t have to fill forms.

Structured understanding should include at least:

- intent  
- destination  
- dates  
- duration  
- travellers  
- budget  
- travelStyle  
- preferences  
- constraints  
- **confidence**  
- **missingInformation**

**US-031** 🟢  
As a traveller, I want the assistant to ask only for missing information that is necessary (especially when confidence is low), so that the flow stays short.

**US-032** 🟢  
As a traveller, I want my clarified need saved as a **Travel Request** (separate from raw Conversation), so that search and recommendations have a clear brief.

**US-033** 🟢  
As the system, I need Conversation ≠ Travel Request ≠ Trip, so that many chats can exist without creating trips, and only selected paths become bookings/trips.

---

## Epic E — Search & stitch existing market *(differentiator)*

Architecture principle:

```
Assistant
    ↓
Travel Search / Discovery Layer
    ↓
Source Adapters (pluggable)
 ┌──────────┬───────────┬──────────┐
 API adapter Affiliate  Partner/…
    ↓           ↓           ↓
        Normalized Travel Option
```

Each external source plugs in via a **Source Adapter**.  
Adapters change; the core system (Travel Option model + ranking) does not.  
Agent / partner is **one possible adapter**, not the foundation.  
No hard dependency on agent integration in V1.

**US-040** 🟢  
As a traveller, I want the system to search travel options through **pluggable source adapters** (e.g. API adapter, affiliate adapter, partner adapter — agents only if an adapter exists), so that I get real options without us owning inventory and without hard-coding any one supplier type into the core.

**US-041** 🟢 *(foundational abstraction — lock early)*  
As the system, I need every source adapter to map its raw payload into a common **Travel Option** model (`Source Adapter → Normalized Travel Option`), so that every source becomes comparable and recommendable the same way and swapping/adding sources does not rewrite the core.

Normalized Travel Option (minimum):

- Destination  
- Duration  
- Stay  
- Transport  
- Activities  
- Price  
- Inclusions  
- Cancellation  
- Source  

Example: “Kashmir 6N package” / “Kashmir family holiday” / “6 nights Srinagar/Gulmarg” → one consistent Travel Option shape.

**US-042** 🟢  
As the system, I need to remove or merge duplicate / conflicting results across sources, so that the customer sees clean choices, not noise.

**US-043** 🟢  
As a traveller, I want each option to identify its **source** and **freshness** (e.g. last checked), so that I don’t assume live pricing when data may be stale.

**US-044** 🟢  
As a traveller, I want incomplete or unavailable supplier information handled honestly and gracefully, so that the assistant never pretends certainty it doesn’t have.

---

## Epic F — Personalize & recommend

**US-050** 🟢  
As a traveller, I want recommendations based on my profile + current Travel Request + budget + dates + party + available options + past feedback — **and the assistant’s confidence about how well it knows me** — so that options fit me, not “most popular.”

Behaviour:

- **New / low confidence:** “I need two more details to make this recommendation.”  
- **Mature profile:** “I already know what you usually prefer.”

**US-051** 🟢  
As a traveller, I want each recommendation to explain why it matches, so that I trust the shortlist.

**US-052** 🟢 *(critical — not a search dump)*  
As a traveller, I want a **small set of strong options** (e.g. ~3 relevant choices), so that choosing is easy.

Example framing:

- Relaxed — ₹62,000  
- Balanced — ₹55,000  
- Experience-heavy — ₹48,000  

Assistant: “I would shortlist these three based on what I know about you.”

---

## Epic G — Select & Enquiry / Connect *(V1 booking priority)*

V1 priority is **Enquiry / Connect**, not complex direct booking orchestration.

```
Option
  ↓
Customer interested
  ↓
Enquiry
  ↓
Provider quotation
  ↓
Customer confirmation
```

**US-060** 🟢  
As a traveller, I want to select one recommended option to proceed, so that I can move from shortlist to action.

**US-061** 🟢  
As a traveller, I want my interest turned into an **enquiry / connect** to a relevant provider, so that I can get a quotation without us owning full booking infrastructure.

**US-062** 🟢  
As a traveller, I want enquiry / quotation status visible at a basic level, so that I know what’s pending vs confirmed.

**US-063** 🔴 LATER  
As a traveller, where a provider API supports it, I want direct booking through the assistant.  
*(Add only where integrations are cheap/clear — not V1 critical path.)*

---

## Epic H — Simple Trip Workspace (very thin)

Not a travel management system. No requirement to manually build itineraries/documents.

**US-070** 🟡 SUPPORTING (minimum)  
As a traveller, **after a confirmed enquiry/booking**, I want a basic trip record (destination, dates, status, confirmed services, and itinerary/documents **only if already available from the source**), so that I have a simple place for the trip without building a TMS or manually assembling content.

**US-071** 🟡  
As a traveller, I want to open that basic trip record from Home, so that I can return quickly.

---

## Epic I — Post-trip feedback → memory *(flywheel)*

```
Trip → Feedback → Memory → Better recommendation → Better trip
```

**US-080** 🟢  
As a traveller, after a trip, I want to give feedback (ratings + liked / disliked), so that the assistant learns.

**US-081** 🟢  
As a traveller, I want that feedback to update long-term memory carefully (without overwriting from one-off trip constraints), so that the next trip improves.

---

# 🟡 SUPPORTING — minimum version only

**US-090** 🟡  
As a traveller, I want the assistant to explain key differences between shortlisted options in conversation (e.g. “A has a better hotel; B has better activities”), so that I can decide without a heavy comparison product.

**US-091** 🔴 → becomes 🟡 only if needed later  
As a traveller, I want a dedicated comparison screen.  
*(Do not overbuild. Conversation comparison first.)*

**US-092** 🟡  
As a traveller, I want basic history of past trips/requests visible, so that continuity exists without a full CRM.

---

# 🔴 LATER — do not build in V1

**F-001** During-trip intelligence (“Where’s my driver?”, weather alternatives, live ops).  
**F-002** Complex booking orchestration across multiple suppliers.  
**F-003** Deep supplier integrations as a hard dependency.  
**F-004** Agent onboarding portal / hotel admin / supplier marketplace.  
**F-005** Own hotel inventory / own transport fleet.  
**F-006** Loyalty, social network, native apps, microservices, heavy ML recommender.  
**F-007** Full OTA / large comparison UI / full travel management system.

---

# Architecture note — AI is not an Epic

AI is an underlying capability, not a customer-facing epic.

```
Assistant Layer
     ↓
LLM / AI
     ↓
Structured Tools
 ├─ Profile / Memory
 ├─ Search / Discovery
 ├─ Recommendation
 ├─ Trip
 ├─ Enquiry / Booking
 └─ Memory update
```

Rules:

- Customer stories should not say “call the LLM.”  
- LLM must **not** get uncontrolled access to DB / external APIs.  
- Assistant calls **structured tools** only.

---

# What we are NOT optimizing for in V1

- Downloads, followers, agent count, destination count  
- Building the full ecosystem on day one  

**Primary V1 question:**  
Can a customer tell the assistant what they want and get a relevant shortlist without manually navigating multiple travel websites?

---

# Story map (quick)

| ID | Title | Priority |
|----|--------|----------|
| US-001 | Simple auth | 🟡 |
| US-010–015 | Profile basics + history | 🟢/🟡 |
| US-016–018 | See/correct memory; remember context; temp vs long-term | 🟢 |
| US-020–024 | Assistant chat + light home | 🟢/🟡 |
| US-030–033 | Intent + request + entity split | 🟢 |
| US-040–044 | Search sources → normalize → dedupe → freshness → graceful gaps | 🟢 |
| US-050–052 | Confidence-aware recommend + explain + shortlist of ~3 | 🟢 |
| US-060–062 | Select → enquiry/connect → status | 🟢 |
| US-063 | Direct booking | 🔴 |
| US-070–071 | Basic trip record after confirm (thin; no manual TMS) | 🟡 |
| US-080–081 | Feedback → memory | 🟢 |
| US-090–092 | Conversational compare + light history | 🟡 |
| F-001–007 | Platform / ops / marketplace / during-trip | 🔴 |
