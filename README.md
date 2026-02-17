![Velocity](https://img.shields.io/badge/velocity-ludicrous-ff69b4)
![Yes](https://img.shields.io/badge/no%3F-yes-brightgreen)

> [!CAUTION]
> If it isn't evident, this is satire and should not be run. Think of this as an art piece.
> Update: publishing steps are now no-ops to reduce misuse

[Satire Account](https://github.com/slopinator-9000)

# 🚀 The Slopinator 9000

![](./wp4746779.webp)

> "Because we prioritize 'velocity' over everything else"

Autonomous pipeline that generates ideas from trending repos, and transforms those ideas into code with ruthless speed.

## What It Does

1. **Scouts** GitHub trending repos
2. **Generates** new ideas (originality judged by LLM of course)
3. **Researches** feasibility (headful Chrome automation)
4. **Implements** using Pi coding agent
5. **Publishes** to GitHub with README, LICENSE, CI
6. **Announces** on Twitter

All with minimal human intervention.

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Run (dry-run mode)
DRY_RUN=true npm run slopinator-9000

# Run for real
npm run slopinator-9000
```

## Requirements

- Node.js 20+
- GitHub account + personal access token
- Twitter API credentials (v2, with write access)
- LLM API key (Anthropic, OpenAI, etc.) — or GitHub Copilot OAuth via `npx pi` → `/login`
- Chromium/Chrome (for Puppeteer research phase)

## Configuration

All configuration is via environment variables. See `.env.example`:

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Yes | GitHub personal access token |
| `GITHUB_USERNAME` | Yes | Your GitHub username |
| `TWITTER_API_KEY` | For tweets | Twitter API key |
| `TWITTER_API_SECRET` | For tweets | Twitter API secret |
| `TWITTER_ACCESS_TOKEN` | For tweets | Twitter access token |
| `TWITTER_ACCESS_SECRET` | For tweets | Twitter access secret |
| `PI_WORKSPACE` | For impl | Workspace directory for generated projects |
| `PI_MODEL` | No | Model to use (default: `claude-sonnet-4-20250514`) |
| `PI_PROVIDER` | No | Model provider (default: `anthropic`) |
| `DRY_RUN` | No | Skip destructive operations |
| `HEADLESS` | No | Run browser headless |
| `LOG_LEVEL` | No | `debug` / `info` / `warn` / `error` |

## Architecture

```
Orchestrator
  ├─ TrendScout Oracle      – GitHub trending → repo list
  ├─ IdeaGenerator Oracle   – repos → derivative ideas
  ├─ ResearchMaster Oracle  – headful browser validation
  ├─ ImplementationMaster   – Pi agent coordination
  ├─ DeploymentSpecialist   – GitHub/NPM deployment
  └─ TwitterAnnouncer       – tweet composition & posting
```

6 specialized oracles coordinated by a main orchestrator. Each oracle has:
- Clear interface & type definitions
- Time budget enforcement
- Structured logging
- Error recovery

See `AGENTS.md` for the full architecture specification.

## Scripts

```bash
npm run slopinator-9000   # Run the full pipeline (tsx)
npm run dev           # Watch mode
npm run build         # Compile TypeScript
npm start             # Run compiled JS
npm test              # Run tests
npm run lint          # ESLint
npm run format        # Prettier
```

## Time Budgets

| Phase | Budget |
|---|---|
| Trend Scouting | 15 min |
| Idea Generation | 20 min |
| Research | 30 min |
| Implementation | 8 hours |
| Deployment | 20 min |
| Announcement | 10 min |

## The Slop Disclaimer

This system prioritizes velocity:
- ✅ Ships working code
- 🤷 Not perfect
- 🚀 Completes in <12 hours
- 🔧 Iterates in production

## License

The Unlicense - do whatever you want with this.
