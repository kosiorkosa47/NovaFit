# NovaFit — Devpost Submission Text

Copy-paste these sections into the Devpost submission form.

---

## Project Title
NovaFit — Multi-Agent AI Wellness Coach

## Tagline (one line)
A 5-agent AI wellness coach that sees your meals, hears your voice, reads your phone sensors, and learns who you are — powered entirely by Amazon Nova.

---

## Inspiration

Health apps today are either too generic ("drink 8 glasses of water") or too complex for everyday use. We wanted something different: an AI coach that actually *knows you* — your sleep patterns, your food allergies, your bad back, your hatred of running — and adapts in real time. Not a chatbot with canned responses, but a multi-agent system where specialized AI agents collaborate, verify each other's work, and talk to you like a knowledgeable friend.

## What it does

NovaFit is a **5-agent dynamic wellness coaching pipeline** where each agent has a specialized role:

1. **Dispatcher** — Classifies user intent (greeting, quick question, follow-up, photo, off-topic/dangerous, full health request) and routes to the minimum required agents. A simple "hello" skips the full pipeline (~1s vs ~7s). Dangerous queries (inhaling chemicals, self-harm) are safely redirected without generating health plans. Uses regex pre-filtering + Nova 2 Lite for ambiguous cases.

2. **Analyzer Agent** — Cross-references phone sensor data (steps, heart rate, sleep, stress) with what you tell it. Produces an energy score (0-100) and identifies key health signals and risk flags. Handles multimodal input — send a meal photo and it estimates calories/macros using Nova's vision.

3. **Planner Agent** — Takes the Analyzer's assessment and builds a concrete plan for *today*: specific meals with calorie counts, exercises matched to your energy level, hydration and recovery tips. Uses **Nova native tool calling** (`toolConfig`) to dynamically decide when to fetch real-time health data or nutrition information.

4. **Validator Agent** — Cross-checks the Planner's recommendations against your Health Twin profile (allergies, food dislikes, health conditions). If conflicts are found (e.g., suggesting shellfish to someone allergic), it rejects the plan and forces the Planner to regenerate. This is a **self-correcting verification loop**.

5. **Monitor Agent** — Composes a warm, conversational response with **real-time token streaming** (typing effect). Extracts new facts about you after every interaction, building the **Health Twin** — a persistent profile of conditions, allergies, preferences, and behavioral patterns that grows smarter over time. Proactively coaches based on detected patterns ("I notice you sleep poorly on work nights — let's plan ahead").

**Additional features:**
- **Voice coaching** — Browser speech recognition (instant) → Nova 2 Lite → native Android TTS (~2s total)
- **Meal photo analysis** — Photograph your food for instant calorie/macro breakdown with health scoring
- **Product label scanning** — OCR ingredients from product labels, detect allergens and health risks
- **Health Dashboard** — 6 metric cards with weekly charts and daily goal tracking
- **Onboarding Wizard** — 3-screen health intake that immediately populates your Health Twin for first-message personalization
- **DynamoDB persistence** — Sessions and Health Twin survive Vercel cold starts, sync across devices
- **Observable reasoning** — Expandable panel shows dispatcher route, per-agent timing, validator status, pipeline trace timeline, and token estimates
- **Safety guardrails** — Dispatcher detects dangerous/off-topic queries and redirects safely without generating health plans
- **47 unit tests** — Vitest coverage for dispatcher (incl. off-topic/dangerous), validator, prompt guard, Health Twin, and JSON utilities

## How we built it

- **AI**: Amazon Nova 2 Lite (text + multimodal vision + tool calling) and Amazon Nova 2 Sonic (voice) via AWS Bedrock
- **Backend**: Next.js 16 App Router with TypeScript, Vercel serverless functions
- **Database**: AWS DynamoDB for session persistence + Health Twin storage + user auth
- **Frontend**: Tailwind CSS + shadcn/ui with custom liquid glass UI design system
- **Mobile**: Android APK via Capacitor 8.x, with native phone sensors (pedometer, heart rate, accelerometer) and custom TTS plugin
- **Streaming**: ConverseStreamCommand for real-time token streaming + Server-Sent Events for pipeline visibility
- **Auth**: NextAuth v5 with Google OAuth + email/password + demo account for judges
- **Testing**: Vitest with 47 unit tests covering core agent logic
- **Deploy**: Vercel (serverless) with DynamoDB on-demand billing

The pipeline is a **true multi-agent system** — not prompt chaining:
- **Dynamic routing** — Dispatcher classifies intent (6 routes incl. off-topic/safety) and skips unnecessary agents (5x faster for greetings)
- **Inter-agent verification** — Validator checks Planner output against Health Twin, triggers re-planning on conflicts
- **Native tool calling** — Planner uses Bedrock's `toolConfig` to decide when and which tools to invoke
- **Predictive coaching** — Monitor proactively references detected patterns from Health Twin
- **Observable reasoning** — Full pipeline trace with per-agent timing and status visible to user

## Amazon Nova usage

| Nova Model | Feature | API |
|---|---|---|
| **Nova 2 Lite** | Dispatcher — intent classification (~50 tokens) | Bedrock Converse API |
| **Nova 2 Lite** | Analyzer — health assessment with energy scoring | Bedrock Converse API |
| **Nova 2 Lite** | Planner — plan generation with 3 tool calls | Converse API with `toolConfig` |
| **Nova 2 Lite** | Validator — deep plan verification against Health Twin | Bedrock Converse API |
| **Nova 2 Lite** | Monitor — streaming conversational response | `ConverseStreamCommand` |
| **Nova 2 Lite** (multimodal) | Meal photo analysis + product label OCR | Converse API with image input |
| **Nova 2 Sonic** | Premium voice streaming (bidirectional audio) | `InvokeModelWithBidirectionalStream` |

**7 distinct Nova API integration points** across 2 models — text reasoning, multimodal vision, native tool calling, token streaming, and voice.

## Challenges we ran into

- **Inter-agent consistency** — The Analyzer would override user-stated values ("I slept 5 hours") with sensor data. Fixed by implementing `extractUserStatedValues()` that persists user statements across the conversation.
- **Validator verification loop** — Building a self-correcting pipeline where the Validator can reject and force re-planning required careful state management to avoid infinite loops (max 1 re-plan attempt).
- **Token streaming + JSON parsing** — Monitor streams response tokens in real-time, but also needs to output structured JSON (tone, adaptation notes, profile updates). Solved by collecting the full stream, then parsing adaptation data post-stream.
- **Voice-text continuity** — Ensuring voice conversations share full history with text chat required a shared session memory layer that both `/api/agent` and `/api/voice-chat` write to.
- **Mobile WebView quirks** — Capacitor WebView: `speechSynthesis` unavailable (custom native TTS plugin), `crypto.randomUUID()` fails without secure context (custom fallback), flexbox scroll chains need `min-h-0` on every container.

## Accomplishments that we're proud of

- **Self-correcting agent pipeline** — Validator catches allergy conflicts and forces Planner to regenerate. Not just error handling — genuine inter-agent communication.
- **Health Twin** — Persistent profile that extracts conditions, allergies, food preferences, exercise habits, behavioral patterns, and lifestyle facts. Syncs server↔client via DynamoDB.
- **Full Nova feature coverage** — 7 integration points: text, vision, tool calling, streaming, voice — all in one coherent product.
- **Observable AI** — Pipeline trace timeline shows exactly which agents ran, how long each took, whether the Validator approved or rejected, and total token estimates.
- **Predictive coaching** — Monitor proactively references Health Twin patterns: "I notice you tend to sleep poorly on work nights — let's prepare for that."
- **Dynamic routing with safety** — Dispatcher makes greetings 5x faster by skipping unnecessary agents, and safely redirects dangerous/off-topic queries. True agentic behavior, not rigid pipeline.

## What we learned

Multi-agent systems need **verification mechanisms**, not just sequential execution. Adding the Validator agent that checks Planner output against the Health Twin profile eliminated an entire class of errors (recommending allergenic foods, suggesting running to someone who hates it). We also learned that **observable reasoning** dramatically increases user trust — when people can see *why* the AI recommended something, they follow through more.

## What's next for NovaFit

- **Wearable integration** — Real smartwatch APIs (Wear OS, Samsung Health) replacing phone sensors
- **Group coaching** — Family/team wellness plans with shared goals
- **Longitudinal insights** — Weekly/monthly health trend analysis from accumulated Health Twin data
- **Specialist agents** — Sleep specialist, nutrition specialist, and exercise specialist agents for deeper domain expertise

## Built With

`amazon-nova` `amazon-nova-2-lite` `amazon-nova-2-sonic` `aws-bedrock` `aws-dynamodb` `nextjs` `typescript` `tailwind-css` `capacitor` `android` `vercel` `next-auth` `shadcn-ui` `vitest`

## Try it out

- **Live demo**: https://novafit-rho.vercel.app
  - Demo login: `demo@novafit.ai` / `demo1234` (pre-populated Health Twin)
- **Source code**: https://github.com/kosiorkosa47/NovaFit
- **Video demo**: [link to YouTube video with #AmazonNova]

#AmazonNova
