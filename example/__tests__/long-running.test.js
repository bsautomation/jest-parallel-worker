/**
 * Long running test examples for jest-parallel-worker
 */

describe('Performance Tests', () => {
  // Helper for simulating work
  const simulateWork = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // A passing long-running test
  it('should handle long running tests @slow', async () => {
    await simulateWork(1500);
    expect(true).toBe(true);
  });
  
  // A test that fails after a long time
  it('should handle failures in long running tests @slow @p0', async () => {
    await simulateWork(1200);
    expect(1).toBe(2); // Will fail after delay
  });

  // A test that times out with custom timeout
  jest.setTimeout(1000); // This only affects tests in this describe block
  it('should respect custom timeouts @timeout', async () => {
    await simulateWork(2000); // Will exceed the 1000ms timeout
    expect(true).toBe(true); // Never reached
  });

  // Reset timeout
  jest.setTimeout(5000);
  
  // Nested tests with varying run times
  describe('Nested performance tests', () => {
    // Different execution times for better parallel demonstration
    const testTimes = [800, 200, 1000, 500, 300];
    
    testTimes.forEach((ms, i) => {
      it(`should complete in about ${ms}ms (test ${i + 1}) @p0`, async () => {
        const startTime = Date.now();
        await simulateWork(ms);
        const elapsed = Date.now() - startTime;
        
        // Add a small buffer for execution time variations
        expect(elapsed).toBeGreaterThanOrEqual(ms);
        expect(elapsed).toBeLessThan(ms + 200);
      });
    });
  });
});

// Example of tests with resource cleanup
describe('Tests with cleanup', () => {
  // Simulate a resource that needs cleanup
  let resource;
  
  beforeEach(() => {
    resource = { 
      name: 'test-resource',
      cleanup: jest.fn()
    };
  });
  
  afterEach(() => {
    // This ensures cleanup happens even if test fails
    resource.cleanup();
  });

  it('should fail but still clean up @p0', async () => {
    await simulateWork(300);
    expect(false).toBe(true); // Will fail
  });
  
  it('should time out but still clean up @timeout', async () => {
    // This will time out
    await new Promise(() => {}); // Never resolves
  });
});

function simulateWork(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}