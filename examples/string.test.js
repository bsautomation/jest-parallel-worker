const { concatenate, toUpperCase, toLowerCase, getLength, asyncStringOperation } = require('./utils/string-utils');

// Example test file with string operations
describe('String Operations', () => {
  beforeAll(() => {
    console.log('String Operations - beforeAll hook executed');
  });

  afterAll(() => {
    console.log('String Operations - afterAll hook executed');
  });

  it('should concatenate strings correctly', () => {
    expect(concatenate('Hello', ' ', 'World')).toBe('Hello World');
  });

  it('should uppercase strings correctly', () => {
    expect(toUpperCase('hello')).toBe('HELLO');
  });

  it('should lowercase strings correctly', () => {
    expect(toLowerCase('WORLD')).toBe('world');
  });

  it('should handle string length', () => {
    expect(getLength('test')).toBe(4);
  });

  it('should handle slow async string operation', async () => {
    const result = await asyncStringOperation('async-result', 200);
    expect(result).toBe('async-result');
  });
});
