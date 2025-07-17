/**
 * Example test file demonstrating how to use jest-parallel-worker
 */

describe('Example test suite', () => {
  // This setup will run for each test when executed with jest-parallel-worker
  beforeEach(() => {
    console.log('Setting up test');
  });

  it('should pass a simple test @p0', () => {
    expect(1 + 1).toBe(2);
  });

  it('should pass an async test', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it('should work with a timeout', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(true).toBe(true);
  });

  // Example of a failing test with assertion error
  it('should fail with assertion error @p0 @kush', () => {
    // This will fail with a detailed error message
    expect({ name: 'test', value: 42 }).toEqual({ name: 'test', value: 43 });
  });

  // Example of a test that will timeout
  it('should timeout if timeout is set too low @timeout', async () => {
    // This will timeout if the test timeout is set to less than 2000ms
    await new Promise(resolve => setTimeout(resolve, 2000));
    expect(true).toBe(true);
  });

  // Example of a test that throws an error
  it('should fail with runtime error @p0', () => {
    // This will throw an error
    const obj = null;
    expect(obj.property).toBe(true); // Will throw TypeError
  });

  // This test is marked as skip and will be identified but not run
  it.skip('should skip this test', () => {
    expect(true).toBe(false); // This would fail, but it's skipped
  });
});

// Multiple describe blocks are supported
describe('Another test suite', () => {
  it('should also run in parallel', () => {
    expect('hello').toBe('hello');
  });
  
  // Nested describe with a failing test
  describe('Nested suite with failure', () => {
    it('should fail with a detailed comparison @p0', () => {
      // This will fail with a detailed diff
      expect('Hello World').toBe('hello world');
    });
  });
});