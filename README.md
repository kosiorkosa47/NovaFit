# NovaFit — Multi-Agent AI Wellness Coach

**Amazon Nova AI Hackathon 2026 Submission**

NovaFit is a 3-agent AI wellness coach that **sees your meals**, **hears your voice**, **reads your phone sensors**, and creates **personalized health plans** — powered entirely by Amazon Nova.

**Live demo**: [novafit-rho.vercel.app](https://novafit-rho.vercel.app)

---

## Architecture

```
                         ┌─────────────────────────────────────────┐
                         │            NovaFit Client               │
                         │  Next.js 16 + Capacitor Android App     │
                         │                                         │
                         │  ┌──────────┐ ┌────────┐ ┌───────────┐ │
                         │  │ Chat UI  │ │ Voice  │ │ Camera/   │ │
                         │  │ (SSE)    │ │ Button │ │ Gallery   │ │
                         │  └────┬─────┘ └───┬────┘ └─────┬─────┘ │
                         │       │           │            │        │
                         │  ┌────┴───────────┴────────────┴─────┐  │
                         │  │     Phone Sensors (Capacitor)     │  │
                         │  │  Steps · Heart Rate · Accelerometer│  │
                         │  └───────────────┬───────────────────┘  │
                         └──────────────────┼──────────────────────┘
                                            │
                                   ┌────────▼────────┐
                                   │   API Gateway    │
                                   │  /api/agent      │
                                   │  /api/meal       │
                                   │  /api/scan       │
                                   │  /api/voice      │
                                   │  /api/tts        │
                                   └────────┬────────┘
                                            │
                    ┌───────────────────────┬┴───────────────────────┐
                    │                       │                        │
           ┌────────▼────────┐    ┌─────────▼─────────┐   ┌─────────▼─────────┐
           │ ANALYZER AGENT  │    │  PLANNER AGENT     │   │  MONITOR AGENT    │
           │                 │    │                    │   │                   │
           │ Nova 2 Lite     │───▶│ Nova 2 Lite        │──▶│ Nova 2 Lite       │
           │                 │    │ + Tool Calling     │   │                   │
           │ Energy scoring  │    │                    │   │ Conversational    │
           │ Signal detection│    │ ┌────────────────┐ │   │ response + tone   │
           │ Risk flagging   │    │ │ TOOLS:         │ │   │ adaptation        │
           │ Multimodal      │    │ │ get_health_data│ │   │ memory learning   │
           │ (image input)   │    │ │ get_nutrition  │ │   │                   │
           │                 │    │ │ get_progress   │ │   │                   │
           └─────────────────┘    │ └────────────────┘ │   └───────────────────┘
                                  └────────────────────┘
                                            │
                              ┌──────────────┴──────────────┐
                              │     FALLBACK ENGINE          │
                              │  Template-based responses    │
                              │  when Bedrock quota exceeded │
                              │  (seamless, user never knows)│
                              └─────────────────────────────┘

     ┌───────────────────┐          ┌───────────────────┐
     │  NOVA 2 SONIC     │          │  MULTIMODAL       │
     │  Voice Pipeline   │          │  Meal Analysis    │
     │                   │          │  Label Scanning   │
     │  STT → 3 Agents   │          │                   │
     │  → TTS Response   │          │  Photo → Nova 2   │
     │                   │          │  Lite Vision →    │
     │  Bidirectional    │          │  Calories/Macros  │
     │  audio streaming  │          │  + Non-food       │
     └───────────────────┘          │  detection        │
                                    └───────────────────┘
```

## Amazon Nova Integration

| Nova Model | Usage | API |
|---|---|---|
| **Nova 2 Lite** | Text analysis, plan generation, conversational responses | Bedrock Converse API |
| **Nova 2 Lite** (multimodal) | Meal photo analysis, product label OCR | Bedrock Converse API with image input |
| **Nova 2 Lite** (tool calling) | Planner agent dynamically calls health data, nutrition, and progress tools | Bedrock Converse API `toolConfig` |
| **Nova 2 Sonic** | Voice-to-voice coaching (STT + TTS) | Bedrock `InvokeModelWithBidirectionalStream` |

### Agent Pipeline Detail

1. **User** sends message (text, voice, or photo)
2. **Analyzer Agent** evaluates wearable data + conversation history + user message → energy score, key signals, risk flags
3. **Planner Agent** creates personalized diet/exercise/recovery plan using **Nova tool calling** to fetch real-time health data and nutrition info
4. **Monitor Agent** composes a natural conversational response, learns from interaction (adaptation notes)
5. Response streams back via **SSE** with real-time agent status updates visible in UI
6. **Fallback Engine** seamlessly activates if Bedrock quota is exceeded — user never sees an error

### What Makes This Agentic (Not Just Prompt Chaining)

- Each agent has a **distinct role and system prompt** — they are specialists, not a single LLM with different instructions
- **Nova native tool calling** — the Planner agent dynamically decides when to call `get_health_data`, `get_nutrition_info`, or `get_daily_progress` using Bedrock's `toolConfig`
- **Agent memory and adaptation** — each conversation builds adaptation notes that modify future behavior
- **Observable reasoning** — expandable "Show reasoning" panel reveals each agent's decision process (energy gauge, signals, tone, learning)
- **Graceful degradation** — intelligent fallback that uses wearable data + topic detection when the AI service is unavailable

## Features

### Core
- 3-agent pipeline: Analyzer → Planner → Monitor
- Real-time SSE streaming with agent step visibility
- Session memory with adaptation notes and user fact extraction
- Bilingual support (English + Polish) — auto-detected from message language

### Voice AI (Nova 2 Sonic)
- Voice transcription flows through the full 3-agent pipeline
- Nova Sonic TTS speaks the agent's response back
- Browser SpeechSynthesis as TTS fallback

### Multimodal Understanding
- Meal photo analysis with calorie/macro breakdown
- Product label OCR with ingredient risk detection
- Non-food product detection (compressed air cans, chemicals → score 0 + warning)
- Meal context persists — agent knows what you ate when you ask follow-up questions

### Mobile (Capacitor Android)
- Native Android APK wrapping the web app
- Real phone sensors: step counter, heart rate, accelerometer
- Auto-detection: native sensors → web sensors → mock data

### Health Dashboard
- Expandable metric cards with weekly bar charts
- Daily goal tracking (steps, water, sleep, exercise, calories)
- Trend analysis with real sensor data

### Security
- NextAuth v5 (Google OAuth + email/password)
- bcrypt password hashing (cost 12)
- Zod input validation on all API endpoints
- Rate limiting per user
- Server-only Bedrock calls (AWS credentials never exposed)
- CSRF protection, httpOnly cookies

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, shadcn/ui |
| AI | AWS Bedrock — Nova 2 Lite, Nova 2 Sonic |
| Auth | NextAuth v5 (Google OAuth + Credentials) |
| Mobile | Capacitor 8.x (Android WebView) |
| Deploy | Vercel (serverless) |
| Nutrition | USDA FoodData Central API |
| Design | Custom liquid glass system (Apple-style) |

## Setup

### Prerequisites
- Node.js 18+
- AWS account with Bedrock access (Nova 2 Lite + Nova 2 Sonic)

### Local development

```bash
git clone https://github.com/kosiorkosa47/NovaFit.git
cd NovaFit
npm install
cp .env.example .env.local
# Fill in AWS credentials and other env vars
npm run dev
```

### Required environment variables

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL_ID_LITE=us.amazon.nova-2-lite-v1:0
BEDROCK_MODEL_ID_SONIC=amazon.nova-sonic-v1:0

# Auth
NEXTAUTH_SECRET=... (openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Optional
NUTRITIONIX_APP_ID=...
NUTRITIONIX_APP_KEY=...
USDA_API_KEY=...
```

### Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add environment variables (server-only, no `NEXT_PUBLIC_` prefix for AWS keys)
4. Deploy

### Android APK

```bash
npx cap sync android
cd android
JAVA_HOME=~/.local/jdk21/Contents/Home \
ANDROID_SDK_ROOT=~/.local/android-sdk \
./gradlew assembleDebug
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/agent` | POST | Multi-agent pipeline (SSE or JSON) |
| `/api/meal` | POST | Meal photo analysis (multipart) |
| `/api/scan` | POST | Product label scan (multipart or text) |
| `/api/voice` | POST | Nova Sonic voice conversation |
| `/api/tts` | POST | Text-to-speech via Nova Sonic |
| `/api/wearable` | GET | Wearable health data |
| `/api/register` | POST | User registration |

## Disclaimer

NovaFit provides wellness guidance and is **not medical diagnosis or emergency care advice**. Always consult a healthcare professional for medical concerns.

---

Built for the [Amazon Nova AI Hackathon 2026](https://amazon-nova.devpost.com/)
