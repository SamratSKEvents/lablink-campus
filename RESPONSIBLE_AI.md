# Responsible AI in LabLink

LabLink uses Gemini where it genuinely helps people: drafting plans, explaining decisions, summarising requests and spotting hazards. It does **not** let AI decide who gets equipment, who is certified, or how safe something is. This file explains the rules and the code that enforces them.

## 1. The core rule: AI may raise caution; only a human may lower it

Safety assessments merge staff-maintained hazard rules with AI flags through a **monotonic merge** ([`src/server/safety/guardian.ts`](src/server/safety/guardian.ts)):

- the hazard level is the *maximum* of staff and AI levels;
- hazards, precautions and PPE are the *union* of both lists;
- a faculty safety review is required if staff rules, the AI, or a "high" level ask for it.

AI output can only add. It cannot remove a precaution, lower a level, or waive a review. If Gemini fails or returns invalid output, the merge falls back to exactly the staff rules, so LabLink never becomes *less* safe when AI is unavailable.

The only way to lower a safety level is `humanLower()`, which requires a PIN-verified staff role and a written reason, and throws for anyone else, including any AI-originated path.

**Proved by tests** ([`tests/safety/guardian.test.ts`](tests/safety/guardian.test.ts)): property-based tests (fast-check, 2,000 random cases) check that for *any* AI output, including hostile attempts to set the level to "none", the merged result is at least as strict as the staff rules on every dimension.

## 2. Humans make every consequential decision

| Decision | Who decides | AI's role |
|---|---|---|
| Who gets a contested slot | The deterministic fair-allocation engine, under a versioned policy | Explains the stored decision record in plain words |
| Approving a project | Faculty, with a PIN; rejections need a reason | Copilot summary, risk flags and a *suggestion* |
| Certification | Technician or faculty after hands-on training, with a PIN | None. A completed tutorial never certifies |
| Whether two units are interchangeable | Numeric spec rules and a technician-verified list | Explains why, in one sentence |
| Emergency instructions | Pre-written by staff, bundled offline ([`src/shared/sos.ts`](src/shared/sos.ts)) | None, ever |
| Lowering a safety level | PIN-verified staff with a reason | None |

## 3. Fairness you can inspect

Every contested allocation stores a decision record: every candidate, the hard rules that filtered anyone out, each score factor, the alternatives offered, and the policy version. Students see why, can appeal to faculty, and faculty can run a **what-if** to see who would slip. Admin overrides require a written reason and are logged. Deadline and stage only count at full weight once faculty verify them, so priority can't be gamed. Fairness is measured (Gini, Lorenz curve) and reported honestly in the benchmark, including where it trades off against deadlines.

## 4. AI output is untrusted

- Every model call goes through one gateway ([`src/server/ai/client.ts`](src/server/ai/client.ts)) with structured output and **zod validation**. Invalid output is discarded.
- Equipment classes, X-Ray shapes and explainer controls must come from fixed lists we define; anything else is rejected or repaired.
- Student text is wrapped as data, and prompts tell the model to ignore instructions inside it (prompt-injection guard).
- Gemini → Groq → deterministic template: every AI feature works with `AI_DISABLED=1`, and CI runs the whole suite that way.
- Every call logs its source, latency and validation failures, never the prompt or the student's text.
- The model is pinned (`GEMINI_MODEL`) so behaviour is reproducible.
- AI text in the interface is always labelled (✦ and a blue bubble) with "Suggested by AI. A person confirms it." Rule-based fallbacks are labelled "Rules-based", never dressed up as AI.
- Prompts ask the model to refer to people by name or "they", never assuming gender.

## 5. The AI may decline

When a project description is unclear, unsafe or outside a teaching lab, the planner returns low confidence and a reason ("ask your faculty") instead of guessing. X-Ray falls back to a plain parts list when it can't map most parts to known shapes.

## 6. Protecting people, not surveilling them

- **Lone-worker check-ins** ask "Are you OK?" every 20 minutes during solo high-hazard work. A missed check-in escalates to a **welfare check by a technician**. It never triggers an emergency by itself, because phones go flat, lock or lose signal. Property tests prove a missed check-in can never produce anything beyond a welfare check.
- **Fatigue limits** (8 lab hours a day with hazardous work, 4 hours continuous) are hard scheduling rules. LabLink optimises for projects finished by rested people, not for squeezing in hours.

## 7. Data minimisation

- **ID cards carry no personal data**, only a signed card number. Lost cards are revoked by bumping a version, which also ends live sessions.
- **Evacuation plans are opt-in**, hold the minimum, are visible to responders only while an incident for that student is active, and can be deleted any time.
- **Near-miss reports are anonymous.** No user id is stored.
- Firestore rules deny all client writes and let students read only their own data.

## 8. Things the AI must never do

- Decide who gets equipment.
- Approve or reject a request.
- Certify anyone.
- Decide that two instruments are equivalent.
- Write emergency or SOS instructions.
- Lower a safety level or remove a precaution.
- Trigger an emergency on its own.

## 9. Known limitations

- Hazard checks support staff judgement; they don't replace a lab's risk assessment.
- QR ID cards can be photographed; real deployments should use secure NFC or SSO.
- In-app SOS alerts are supplementary; call 112.
- AI explanations can be wrong. The stored decision record, not the explanation, is the source of truth.
