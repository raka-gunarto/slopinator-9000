import type { GeneratedIdea, ImplementationResult } from '../types/oracles.js';

/**
 * Generate a README.md for a newly created project.
 */
export function generateReadme(
  idea: GeneratedIdea,
  implementation?: ImplementationResult,
): string {
  const badges = [
    '![Version](https://img.shields.io/badge/version-0.1.0-blue)',
    '![License](https://img.shields.io/badge/license-MIT-green)',
    '![Velocity](https://img.shields.io/badge/velocity-ludicrous-ff69b4)',
    '![Yes](https://img.shields.io/badge/no%3F-yes-brightgreen)',
  ];

  const features = idea.coreFeatures
    .map((f) => `- **${f.name}**: ${f.description}`)
    .join('\n');

  const timeToShip = implementation
    ? `${implementation.totalHours.toFixed(1)} hours`
    : `~${idea.estimatedHours} hours (estimated)`;

  return `${badges.join(' ')}

# ${idea.name}

> [!CAUTION]
> This is satire.

> ${idea.tagline}

${idea.description}

## Features

${features}

## Quick Start

\`\`\`bash
npm install ${idea.name.toLowerCase().replace(/\\s+/g, '-')}
\`\`\`

\`\`\`typescript
import { /* ... */ } from '${idea.name.toLowerCase().replace(/\\s+/g, '-')}';

// See examples/ for usage
\`\`\`

## Development

\`\`\`bash
git clone https://github.com/YOUR_USERNAME/${idea.name.toLowerCase().replace(/\\s+/g, '-')}
cd ${idea.name.toLowerCase().replace(/\\s+/g, '-')}
npm install
npm run dev
\`\`\`

## Meta

This project was built by [Slopinator-9000](https://github.com/slopinator-9000/slopinator-9000) — an autonomous pipeline that goes from trending repos to deployed projects.

**Time to ship:** ${timeToShip}

### The Slop Disclaimer

This was built prioritizing velocity over perfection:
- ✅ It works (mostly)
- 🤷 It's not perfect
- 🚀 It shipped fast
- 🔧 PRs welcome

## License

MIT
`;
}
