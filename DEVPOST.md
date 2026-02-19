# NovaFit — Devpost Submission Text

Copy-paste these sections into the Devpost submission form.

---

## Project Title
NovaFit — Multi-Agent AI Wellness Coach

## Tagline (one line)
A 3-agent AI wellness coach that sees your meals, hears your voice, reads your phone sensors, and learns who you are — powered entirely by Amazon Nova.

---

## Inspiration

Health apps today are either too generic ("drink 8 glasses of water") or too complex for everyday use. We wanted something different: an AI coach that actually *knows you* — your sleep patterns, your food allergies, your bad back, your hatred of running — and adapts in real time. Not a chatbot with canned responses, but a multi-agent system where specialized AI agents collaborate to understand your state, build a personalized plan, and talk to you like a knowledgeable friend.

## What it does

NovaFit is a multi-agent wellness coaching system with three specialized Amazon Nova agents working in sequence:

1. **Analyzer Agent** — Reads your phone sensors (steps, heart rate, sleep) and cross-references with what you tell it. Produces an energy score and identifies key health signals. Handles images too — you can send a meal photo and it estimates calories and macros using Nova's multimodal vision.

2. **Planner Agent** — Takes the Analyzer's assessment and builds a concrete plan for *today*: specific meals with calorie counts, exercises matched to your energy level, hydration and recovery tips. Uses **Nova native tool calling** to dynamically fetch real-time health data and nutrition information.

3. **Monitor Agent** — Composes a warm, conversational response and learns from every interaction. It builds a **Health Twin** — a persistent profile of your conditions, allergies, preferences, and behavioral patterns that grows smarter with every conversation.

You can interact via text, voice (Nova 2 Sonic), or by photographing your meals. The entire agent reasoning process is transparent — you can expand "Show reasoning" to see exactly how each agent reached its conclusions.

## How we built it

- **AI**: Amazon Nova 2 Lite (text + multimodal vision + tool calling) and Amazon Nova 2 Sonic (voice STT/TTS) via AWS Bedrock
- **Frontend**: Next.js 16 with TypeScript, Tailwind CSS, and shadcn/ui — custom liquid glass UI design
- **Mobile**: Android APK via Capacitor 8.x, with native phone sensors (pedometer, heart rate, accelerometer)
- **Streaming**: Server-Sent Events for real-time agent pipeline visibility
- **Auth**: NextAuth v5 with Google OAuth + email/password
- **Deploy**: Vercel (serverless) with automatic scaling
- **Nutrition**: USDA FoodData Central API for food lookups

The agent pipeline is a true multi-agent system — not just prompt chaining. Each agent has a distinct role, distinct system prompt, and produces structured JSON output that feeds into the next. The Planner uses Nova's native `toolConfig` to decide when to call external tools. The system includes intelligent fallback — if Bedrock quota is exceeded, template-based responses seamlessly take over.

## Amazon Nova usage

| Nova Model | Feature | How |
|---|---|---|
| **Nova 2 Lite** (text) | 3-agent pipeline: analysis, planning, coaching | Bedrock Converse API with structured JSON output |
| **Nova 2 Lite** (multimodal) | Meal photo analysis + product label OCR | Bedrock Converse API with base64 image input |
| **Nova 2 Lite** (tool calling) | Dynamic data fetching in Planner agent | Bedrock Converse API with `toolConfig` — `get_health_data`, `get_nutrition_info`, `get_daily_progress` |
| **Nova 2 Sonic** | Voice-to-voice coaching | Bedrock `InvokeModelWithBidirectionalStream` for STT + TTS |

**What makes it agentic:**
- Three specialized agents with distinct roles and reasoning
- Nova native tool calling (not external function execution — the model decides when and which tools to use)
- Agent memory with adaptation notes — behavior evolves based on past interactions
- Health Twin — persistent user profile built from extracted facts across sessions
- Observable reasoning — users can inspect each agent's decision process
- Graceful degradation — fallback engine activates seamlessly when the AI service is unavailable

## Challenges we ran into

- **Agent memory consistency** — The analyzer would sometimes override user-stated values ("I slept 5 hours") with sensor data (7h from mock). Fixed by reordering prompts: conversation history comes first, sensor data second, with explicit "user-stated values override sensors" instructions.
- **Energy score drift** — Follow-up messages about dinner would randomly change the energy score from 35 to 65. Fixed by persisting previous scores in adaptation notes.
- **Nova 2 Sonic integration** — Getting bidirectional audio streaming working required careful WebSocket-to-HTTP bridge design for the serverless environment.
- **Mobile WebView quirks** — Capacitor WebView had numerous issues: `crypto.randomUUID()` failing without secure context, pseudo-elements blocking touch events, flexbox scroll chains needing `min-h-0` on every container.

## Accomplishments that we're proud of

- **True multi-agent system** — not just a prompt chain, but specialized agents that produce structured data for the next agent, with tool calling and memory
- **Health Twin** — the AI learns your allergies, food preferences, exercise habits, health conditions, and behavioral patterns, building a persistent profile that grows smarter
- **Full Nova coverage** — text, vision, tool calling, and voice, all in one coherent product
- **Observable AI** — expandable reasoning panels showing exactly how each agent thinks
- **Seamless fallback** — users never see an error, even when API quotas are exceeded

## What we learned

Building a multi-agent system is fundamentally different from single-prompt engineering. Prompt ordering matters enormously — putting conversation history before sensor data completely changed how the Analyzer weighted information. We also learned that agent memory needs explicit consistency mechanisms (storing previous scores, extracting user-stated values) rather than relying on the model to "just remember."

## What's next for NovaFit

- **DynamoDB persistence** — moving from in-memory session storage to cloud-persistent data
- **Wearable integration** — connecting to real smartwatch APIs (Wear OS, Samsung Health)
- **Group coaching** — family/team wellness plans with shared goals
- **Longitudinal insights** — weekly/monthly health trend analysis from accumulated Health Twin data

## Built With

`amazon-nova` `aws-bedrock` `nextjs` `typescript` `tailwind-css` `capacitor` `android` `vercel` `next-auth` `shadcn-ui`

## Try it out

- **Live demo**: https://novafit-rho.vercel.app
- **Source code**: https://github.com/kosiorkosa47/NovaFit
- **Video demo**: [link to YouTube/Loom]

#AmazonNova
