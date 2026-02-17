# NovaFit — Claude Code Instructions

## ALWAYS READ FIRST
Before starting ANY work, read the hackathon master plan:
`/Users/anetaopilowska/.claude/projects/-Users-anetaopilowska-Michal-Projects-NovaFit/memory/hackathon-plan.md`

## Project
NovaFit — multi-agent AI wellness coach for Amazon Nova AI Hackathon 2026.
Deadline: **16 March 2026, 5:00 PM PDT**.

## Stack
Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui, AWS Bedrock (Nova 2 Lite + Sonic)

## Rules
- Communicate in Polish
- Prefer working code over perfect code
- Test with `pnpm lint` and `npx next build` after changes
- Mobile-first — always consider touch, scroll, HTTPS
- Use `uid()` helper instead of `crypto.randomUUID()` (HTTP compatibility)
- Keep `min-h-0` on all flex containers in scroll chains
- No pseudo-elements on interactive containers (breaks mobile touch)
