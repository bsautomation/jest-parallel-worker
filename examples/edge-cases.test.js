describe('Edge Case Tests', () => {
  test('should pass normally', () => {
    expect(2 + 2).toBe(4);
  });

  test('should fail with assertion error', () => {
    expect(1 + 1).toBe(3); // This will fail
  });

  test('should pass with async operation', async () => {
    const result = await new Promise(resolve => setTimeout(() => resolve(42), 100));
    expect(result).toBe(42);
  });

  test('should throw an error', () => {
    throw new Error('Intentional test error');
  });

  test('should handle timeout', (done) => {
    // This test will timeout
    setTimeout(() => {
      done();
    }, 10000); // 10 seconds - should timeout before this
  }, 5000); // 5 second timeout
});
