describe('Force Concurrent Example', () => {
  // These regular test() calls will be transformed to test.concurrent()
  // when using --forceConcurrent option
  
  test('async operation 1', async () => {
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(1 + 1).toBe(2);
  });

  test('async operation 2', async () => {
    // Simulate async work  
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(2 * 3).toBe(6);
  });

  test('async operation 3', async () => {
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(10 / 2).toBe(5);
  });

  test('async operation 4', async () => {
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 120));
    expect(4 * 4).toBe(16);
  });

  // This will remain as test.concurrent() and work normally
  test.concurrent('already concurrent test', async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(true).toBe(true);
  });
});
