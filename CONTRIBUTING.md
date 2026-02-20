# Contributing to NovaFit

Thank you for your interest in contributing to NovaFit!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/NovaFit.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature`
5. Copy `.env.example` to `.env.local` and fill in your AWS credentials

## Development

```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

## Project Structure

- `app/` — Next.js App Router pages and API routes
- `components/` — React UI components
- `lib/agents/` — AI agent implementations (Analyzer, Planner, Monitor, Dispatcher)
- `lib/orchestrator/` — Multi-agent pipeline orchestration
- `lib/bedrock/` — AWS Bedrock Nova API integration
- `lib/session/` — Session memory management
- `lib/db/` — DynamoDB client and helpers

## Pull Request Process

1. Ensure `npm run build` passes with zero errors
2. Update documentation if you changed any APIs
3. Write a clear PR description explaining what and why
4. Link any related issues

## Code Style

- TypeScript strict mode
- Functional components with hooks
- Tailwind CSS for styling
- Use existing patterns from the codebase

## Reporting Bugs

Use the [Bug Report](https://github.com/kosiorkosa47/NovaFit/issues/new?template=bug_report.md) issue template.

## Suggesting Features

Use the [Feature Request](https://github.com/kosiorkosa47/NovaFit/issues/new?template=feature_request.md) issue template.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
