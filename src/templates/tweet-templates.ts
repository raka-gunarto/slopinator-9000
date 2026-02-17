import type { TweetStyle } from '../types/oracles.js';

interface TweetData {
  name: string;
  description: string;
  githubUrl: string;
  npmUrl?: string;
  hours: number;
  originalRepo: string;
  strategy: string;
}

const templates: Record<TweetStyle, (data: TweetData) => string> = {
  honest: (data) =>
    `Just shipped ${data.name} in ${data.hours.toFixed(1)} hours 🚀

${data.description}

Built by an autonomous agent pipeline. It works, mostly.

${data.githubUrl}

#BuildInPublic #VelocityCoding`,

  meme: (data) =>
    `POV: You gave an AI agent access to GitHub trending and told it to ship

Result: ${data.name} ✨

${data.description}

${data.githubUrl}

Is this progress? Who knows. But it's shipped.`,

  technical: (data) =>
    `New project: ${data.name}

Inspired by ${data.originalRepo}, using a ${data.strategy} approach.

Built in ${data.hours.toFixed(1)}h
Status: It runs™️

${data.githubUrl}`,

  chaotic: (data) =>
    `i told an AI to build something inspired by trending repos

it made ${data.name}

is it good? idk
does it work? mostly
should you use it? probably not

but it's shipped and that's what matters

${data.githubUrl}`,
};

/**
 * Compose a tweet for the given style and data.
 * Automatically truncates to 280 chars.
 */
export function composeTweetText(style: TweetStyle, data: TweetData): string {
  const text = templates[style](data);
  if (text.length <= 280) return text;
  return text.substring(0, 277) + '...';
}

/**
 * Select tweet style based on idea characteristics.
 */
export function selectTweetStyle(slopFactor: number, complexity: string): TweetStyle {
  const hour = new Date().getHours();

  // Late night = chaotic energy
  if (hour >= 23 || hour < 6) return 'chaotic';

  if (slopFactor > 80) return 'meme';
  if (complexity === 'complex') return 'technical';

  return Math.random() > 0.7 ? 'technical' : 'honest';
}
