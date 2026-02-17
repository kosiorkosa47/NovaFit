# Nova Health Agent

Production-minded MVP for the Amazon Nova AI Hackathon 2026.

Nova Health Agent is a **secure multi-agent personalized healthcare assistant** built with **Next.js 16 App Router**, **TypeScript**, **Tailwind + shadcn/ui**, and **Amazon Nova models through AWS Bedrock**.

## Why this project is hackathon-ready

- Deep Nova integration with explicit Bedrock calls via `@aws-sdk/client-bedrock-runtime`
- Manual multi-agent orchestration (Analyzer, Planner, Monitor) without external agent frameworks
- Voice-first UX with browser speech input/output and clear Nova Sonic upgrade path
- Self-adapting behavior using per-session memory + feedback loops
- Security-first architecture: server-only model calls, validation, sanitization, defensive error handling

## Architecture

### Agent flow

1. User message arrives (`"I'm tired after work"`)
2. Analyzer Agent evaluates wearable snapshot + conversation history
3. Planner Agent generates personalized diet/exercise/recovery guidance (Nutritionix optional)
4. Monitor Agent responds conversationally and asks for feedback
5. Feedback is stored and injected into subsequent prompts for adaptation

### Security model

- Bedrock SDK calls only happen on server in:
  - `/app/api/agent/route.ts`
  - `/lib/bedrock.ts`
- AWS credentials are never exposed to browser code
- API payload validation with `zod`
- Input sanitization for messages and feedback
- No dynamic code execution (`eval`, `new Function`) and no unsafe deserialization
- Friendly non-sensitive error messages
- In-memory per-session storage with bounded history and TTL cleanup
- Production assumption: HTTPS terminates at hosting edge (e.g., Vercel)

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui-style components
- AWS SDK v3: `@aws-sdk/client-bedrock-runtime`
- Zod validation
- Sonner toasts
- Browser Web Speech API (SpeechRecognition + SpeechSynthesis)

## Project structure

```text
.
├── app/
│   ├── api/agent/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── favicon.ico
├── api/agent/route.ts          # compatibility re-export stub
├── components/
│   ├── ChatInterface.tsx
│   ├── LoadingSpinner.tsx
│   ├── MessageBubble.tsx
│   ├── VoiceButton.tsx
│   └── ui/
├── lib/
│   ├── bedrock.ts
│   ├── constants.ts
│   ├── integrations.ts
│   ├── orchestrator.ts
│   ├── types.ts
│   └── utils.ts
├── .env.example
├── components.json
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## 1) Bedrock setup for Nova models

1. Open AWS Console -> Bedrock -> Model access.
2. Request access to Nova models used by this app (Lite and Sonic variants available in your region).
3. Ensure IAM principal used locally or in Vercel has Bedrock runtime permissions:
   - `bedrock:InvokeModel`
   - `bedrock:Converse`
4. Confirm region supports your selected model IDs.

Notes:
- Default `.env.example` values include:
  - `BEDROCK_MODEL_ID_LITE=amazon.nova-lite-v1:0`
  - `BEDROCK_MODEL_ID_SONIC=amazon.nova-2-sonic-v1:0`
- If your account uses a different Sonic ID, override `BEDROCK_MODEL_ID_SONIC`.

## 2) Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Fast demo from terminal

Keep `npm run dev` running in one terminal, then run either script in another:

```bash
# Two-turn judge narrative in JSON mode
npm run demo:judge

# Live status/agent/final event stream in SSE mode
npm run demo:sse
```

Optional:

```bash
NOVA_HEALTH_BASE_URL=http://localhost:3000 npm run demo:judge
```

### Required environment variables

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL_ID_LITE=amazon.nova-lite-v1:0
BEDROCK_MODEL_ID_SONIC=amazon.nova-2-sonic-v1:0
NUTRITIONIX_APP_ID=xxx
NUTRITIONIX_APP_KEY=xxx
USE_REAL_NUTRITIONIX=false
USE_MOCK_WEARABLES=true
```

## 3) API contract

`POST /api/agent`

Request body:

```json
{
  "sessionId": "uuid-or-safe-id",
  "message": "I'm tired after work",
  "feedback": "Make it lighter",
  "mode": "stream"
}
```

`mode` options:
- `stream` (default): `text/event-stream` with events (`status`, `agent_update`, `final`, `error`, `done`)
- `json`: returns final JSON payload only

## 4) Voice support

- Voice input uses browser `SpeechRecognition` (`webkitSpeechRecognition` fallback)
- Voice output uses `SpeechSynthesis`
- MVP includes comments showing where to replace TTS with real Nova Sonic audio stream integration

## 5) Deploying to Vercel

1. Push repository to Git provider.
2. Import project into Vercel.
3. Set environment variables in Vercel Project Settings -> Environment Variables:
   - `AWS_REGION`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `BEDROCK_MODEL_ID_LITE`
   - `BEDROCK_MODEL_ID_SONIC`
   - optional Nutritionix keys/flags
4. Keep all AWS vars server-side only (no `NEXT_PUBLIC_` prefix).
5. Deploy and verify `/api/agent` in production logs.

## 6) Why no agent frameworks

For this MVP, orchestration is written directly in TypeScript (`/lib/orchestrator.ts`) instead of LangChain/LangGraph/CrewAI/AutoGen/LlamaIndex.

Benefits:
- Smaller attack surface
- Transparent reasoning flow
- Easier security review
- Direct control over prompts, retries, event streaming, and memory handling

## 7) Judge demo script

1. User says or types: `"I'm tired after work"`
2. Show Analyzer output (energy + wearable interpretation)
3. Show Planner output (diet/exercise/hydration/recovery)
4. Show Monitor output (empathetic coaching + feedback question)
5. Enter feedback: `"too intense"`
6. Show adapted plan on the next turn

You can automate this using `npm run demo:judge` and display the output directly to judges.

## Disclaimer

This MVP provides wellness guidance and is **not medical diagnosis or emergency care advice**.
