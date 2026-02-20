# NovaFit Demo Video Script (~3 min)

**Format**: screen recording telefonu/przegladarki + voiceover po angielsku (judges)
**Hashtag w tytule/opisie**: #AmazonNova
**Tytul na YouTube**: "NovaFit — 5-Agent AI Wellness Coach | Amazon Nova Hackathon 2026 #AmazonNova"

---

## INTRO (0:00–0:15)

> **Voiceover (EN):**
> "NovaFit is a 5-agent AI wellness coach powered entirely by Amazon Nova. It sees your meals, hears your voice, reads your phone sensors, and learns who you are — let me show you."

**Ekran:** Logo NovaFit na login page, widac "Try Demo" button.

---

## DEMO LOGIN (0:15–0:30)

> **Voiceover:**
> "Judges can try it instantly — no signup needed. Just click Try Demo."

**Akcja:** Kliknij "Try Demo — No signup needed". App laduje sie BEZPOSREDNIO na chat (onboarding pominiety).

> **Voiceover:**
> "The demo account comes with a pre-populated Health Twin — the app already knows this user's allergies, food preferences, exercise habits, and lifestyle patterns. New users would go through a 3-screen onboarding wizard to build this profile."

**Akcja:** Szybko pokaz tab Profile zeby uwidocznic Health Twin dane (shellfish allergy, food likes, patterns, lifestyle), potem wroc na Chat.

---

## CHAT — FULL PIPELINE (0:30–1:15)

> **Voiceover:**
> "Now watch the 5-agent pipeline in action. I'll tell Nova I'm tired."

**Akcja:** Wpisz: "I'm exhausted, only slept 5 hours and I have a long day ahead"

> **Voiceover (podczas ladowania):**
> "The Dispatcher classifies this as a full health request and routes it through all 5 agents — Analyzer, Planner, Validator, and Monitor. Watch the streaming response appear in real time."

**Akcja:** Poczekaj na odpowiedz (streaming, typing effect). Potem kliknij "Show reasoning".

> **Voiceover:**
> "The reasoning panel shows everything: the Dispatcher chose 'Full Pipeline', each agent's execution time, the Validator confirmed the plan is safe, and here's the pipeline trace — a visual timeline of all 5 agents."

**Akcja:** Pokaz rozwiniety reasoning panel — route badge, agent badges z timingiem, validator badge "Plan Validated", pipeline trace bar.

---

## VALIDATOR DEMO (1:15–1:40)

> **Voiceover:**
> "Here's what makes this truly agentic — the Validator checks recommendations against your Health Twin. Watch what happens when I ask about dinner."

**Akcja:** Wpisz: "What should I eat for dinner tonight?"

> **Voiceover (po odpowiedzi):**
> "The Validator cross-checked the Planner's suggestions against my allergy profile — shellfish is excluded. If it had suggested shrimp, the Validator would reject the plan and force the Planner to regenerate. This is a self-correcting verification loop, not just prompt chaining."

**Akcja:** Kliknij "Show reasoning" — pokaz validator badge.

---

## MEAL PHOTO (1:40–2:00)

> **Voiceover:**
> "Nova's multimodal vision analyzes meal photos. Let me photograph my lunch."

**Akcja:** Kliknij ikone kamery → "Analyze Meal" → zrob zdjecie jedzenia LUB wybierz z galerii.

> **Voiceover:**
> "Nova 2 Lite identifies each dish, estimates calories and macros, and gives a health score. This context is saved — when I ask the agents about my nutrition later, they know exactly what I ate."

**Akcja:** Pokaz MealAnalysisCard z wynikami (kalorie, makro, health score).

---

## VOICE MODE (2:00–2:20)

> **Voiceover:**
> "Voice mode uses browser speech recognition for instant transcription, routes through the same agent pipeline, and responds via native Android TTS — total latency under 2 seconds."

**Akcja:** Kliknij mikrofon, powiedz: "How much water should I drink today?" Poczekaj na odpowiedz glosowa.

> **Voiceover:**
> "Voice and text share the same conversation history — nothing is lost between modes."

---

## DASHBOARD + HEALTH TWIN (2:20–2:40)

> **Voiceover:**
> "The dashboard tracks 6 health metrics with weekly charts and daily goals. All powered by real phone sensors via our native Android app."

**Akcja:** Przejdz na tab Dashboard — pokaz metryki, wykresy, goals.

> **Voiceover:**
> "The Health Twin persists in DynamoDB — it survives app restarts, syncs across devices, and gets smarter with every conversation."

**Akcja:** Przejdz na Profile — pokaz Health Twin facts (allergies, patterns, lifestyle).

---

## CLOSING (2:40–3:00)

> **Voiceover:**
> "NovaFit — 5 specialized agents, 7 Amazon Nova integration points, self-correcting verification, persistent memory, voice, vision, and a native Android app. All built for the Amazon Nova Hackathon. Try it yourself at novafit-rho.vercel.app."

**Ekran:** Pokaz URL + "demo@novafit.ai / demo1234" na ekranie.

---

## TIPS DO NAGRYWANIA

1. **Nagraj w Chrome** (desktop) z DevTools mobile emulation ALBO bezposrednio na telefonie
2. **Voiceover nagraj osobno** (np. w Voice Memos) i doloz w edycji
3. Jezeli nagrywasz na telefonie — uzywaj **landscape** albo **portrait z duzym fontem**
4. **Nie spieszysz sie** — lepiej spokojnie 2:50 niz chaotycznie 3:00
5. Upload na **YouTube** (unlisted jest OK), dodaj #AmazonNova w tytule I opisie
6. W opisie YouTube dodaj: "Live demo: https://novafit-rho.vercel.app | Source: https://github.com/kosiorkosa47/NovaFit"
