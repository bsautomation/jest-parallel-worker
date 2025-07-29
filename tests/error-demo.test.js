const { describe, it, expect, test } = require('@jest/globals');

describe('Error Message Test', () => {
  test('should pass this test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should fail with clear error message', () => {
    expect(5).toBe(10);
  });

  test('should fail with assertion error', () => {
    expect('hello').toContain('world');
  });

  test('should fail with object comparison', () => {
    const actual = { name: 'John', age: 30 };
    const expected = { name: 'Jane', age: 25 };
    expect(actual).toEqual(expected);
  });
});
