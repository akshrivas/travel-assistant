# Travel Assistant — V1 LOCK

**Locked at:** V1.0  
**Artifacts:**
- `Travel-Assistant-MVP-User-Stories.md`
- `Travel-Assistant-MVP-Development-Backlog.md`

**Identity (immutable for V1):**  
Personal Travel Assistant on existing travel market — not OTA, not marketplace, not agent-onboarding-first.

**Core motive (immutable):**  
Customer ko fayda pahunchana. Hum market se compete nahi karte — jo pehle se chal raha hai, usme se best use karke customer tak pahunchate hain. Invent kam, stitch + compare + personalize zyada.

**Working principle (immutable — remember on every build):**  
1. **Abhi:** existing market / existing systems ko stitch + use karo. Naya inventory, naya OTA, naya supplier portal mat banao.  
2. **Samay ke saath:** system zyada **user-specific** hota jaaye (profile, conversation memory, feedback, confidence).  
3. **Upar ka destination:** usi user ki **poori trip** plan karna — shortlist → enquire/connect → trip — bina market ko replace kiye.

**Spine (immutable for V1):**  
Understand customer → Understand trip → Stitch existing market → Personalize → Shortlist → Connect → Learn

**Abstractions locked:**  
- Conversation ≠ Travel Request ≠ Recommendation ≠ Trip  
- Source Adapter → Normalized Travel Option  

**Milestones locked:** M1 Shortlist · M2 Enquiry/Connect · M3 Learn  

**Onboarding:** locked as of V1 (basics + travel defaults + prefs/language/mood path).  

Any change = new version (V1.1+), not silent drift.
