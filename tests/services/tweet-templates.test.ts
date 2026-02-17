import { composeTweetText, selectTweetStyle } from '../../src/templates/tweet-templates.js';

describe('Tweet Templates', () => {
  const sampleData = {
    name: 'cool-tool',
    description: 'A cool developer tool',
    githubUrl: 'https://github.com/test/cool-tool',
    hours: 3.5,
    originalRepo: 'test/original',
    strategy: 'complementary',
  };

  test('composeTweetText should return a string under 280 chars', () => {
    const text = composeTweetText('honest', sampleData);
    expect(text.length).toBeLessThanOrEqual(280);
    expect(text).toContain('cool-tool');
    expect(text).toContain('github.com');
  });

  test('composeTweetText should truncate long tweets', () => {
    const longData = {
      ...sampleData,
      description: 'A'.repeat(300),
    };
    const text = composeTweetText('honest', longData);
    expect(text.length).toBeLessThanOrEqual(280);
  });

  test('selectTweetStyle returns a valid style', () => {
    const style = selectTweetStyle(50, 'simple');
    expect(['honest', 'meme', 'technical', 'chaotic']).toContain(style);
  });

  test('selectTweetStyle returns meme for high slop factor', () => {
    const style = selectTweetStyle(90, 'simple');
    // Could be meme or chaotic (if late night)
    expect(['meme', 'chaotic']).toContain(style);
  });
});
