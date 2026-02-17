// Mock external ESM dependencies that Jest can't transform
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: { search: { repos: jest.fn() }, repos: { get: jest.fn() } },
  })),
}));

import { TrendScout } from '../../src/oracles/trend-scout.js';
import type { TrendingRepo } from '../../src/types/oracles.js';

describe('TrendScout', () => {
  let scout: TrendScout;

  beforeEach(() => {
    scout = new TrendScout();
  });

  test('rankByPotential should sort repos by ideaPotential descending', () => {
    const repos: TrendingRepo[] = [
      makeFakeRepo('repo1', 50),
      makeFakeRepo('repo2', 80),
      makeFakeRepo('repo3', 30),
    ];

    const ranked = scout.rankByPotential(repos);

    expect(ranked[0].name).toBe('repo2');
    expect(ranked[1].name).toBe('repo1');
    expect(ranked[2].name).toBe('repo3');
  });

  test('rankByPotential should not mutate the original array', () => {
    const repos: TrendingRepo[] = [
      makeFakeRepo('a', 10),
      makeFakeRepo('b', 90),
    ];

    const original = [...repos];
    scout.rankByPotential(repos);

    expect(repos[0].name).toBe(original[0].name);
  });
});

function makeFakeRepo(name: string, ideaPotential: number): TrendingRepo {
  return {
    url: `https://github.com/test/${name}`,
    name,
    owner: 'test',
    description: 'A test repo',
    stars: 100,
    language: 'TypeScript',
    topics: [],
    createdAt: new Date(),
    lastPush: new Date(),
    ideaPotential,
    complexity: 'simple',
    ideaSurfaces: [],
    reasoning: 'test',
  };
}
