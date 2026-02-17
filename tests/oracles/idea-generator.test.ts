import { IdeaGenerator } from '../../src/oracles/idea-generator.js';
import type { TrendingRepo } from '../../src/types/oracles.js';

// Mock the PiAgent so Jest doesn't choke on native ESM deps
jest.mock('../../src/services/pi-agent.js', () => ({
  PiAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: false, output: '' }),
  })),
}));

describe('IdeaGenerator', () => {
  let generator: IdeaGenerator;

  beforeEach(() => {
    generator = new IdeaGenerator();
  });

  test('applyStrategy("complementary") should return an idea with correct strategy field', async () => {
    const repo = makeFakeRepo();

    const idea = await generator.applyStrategy(repo, 'complementary');

    expect(idea.strategy).toBe('complementary');
    expect(idea.language).toBe('TypeScript');
    expect(idea.originalRepo).toContain(repo.name);
  });

  test('validateIdea should flag ideas with too many hours', async () => {
    const repo = makeFakeRepo();
    const idea = await generator.applyStrategy(repo, 'complementary');
    idea.estimatedHours = 12;

    const validation = await generator.validateIdea(idea);

    expect(validation.concerns).toContainEqual(expect.stringContaining('time budget'));
  });

  test('validateIdea should accept reasonable ideas', async () => {
    const repo = makeFakeRepo();
    const idea = await generator.applyStrategy(repo, 'complementary');

    const validation = await generator.validateIdea(idea);

    expect(validation.isBuildable).toBe(true);
  });
});

function makeFakeRepo(): TrendingRepo {
  return {
    url: 'https://github.com/test/cool-lib',
    name: 'cool-lib',
    owner: 'test',
    description: 'A cool TypeScript library for doing things',
    stars: 500,
    language: 'TypeScript',
    topics: ['typescript', 'library'],
    createdAt: new Date(),
    lastPush: new Date(),
    ideaPotential: 75,
    complexity: 'moderate',
    ideaSurfaces: ['complementary-tool'],
    reasoning: 'Good potential',
  };
}
