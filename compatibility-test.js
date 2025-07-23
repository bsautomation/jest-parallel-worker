// Simple test file for troubleshooting jest-parallel in other repositories
// This file should work in most JavaScript/Node.js projects

describe('Jest Parallel Compatibility Test', () => {
  test('basic assertion should pass', () => {
    expect(1 + 1).toBe(2);
  });

  test('string manipulation should work', () => {
    const str = 'hello world';
    expect(str.toUpperCase()).toBe('HELLO WORLD');
  });

  test('array operations should work', () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr.includes(2)).toBe(true);
  });

  test('promise resolution should work', async () => {
    const promise = Promise.resolve('success');
    const result = await promise;
    expect(result).toBe('success');
  });

  test('timeout test with short delay', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(true).toBe(true);
  });
});
