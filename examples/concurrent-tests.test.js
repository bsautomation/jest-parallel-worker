describe('Concurrent Tests', () => {
  test.concurrent('concurrent test 1', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(1 + 1).toBe(2);
  });

  test.concurrent('concurrent test 2', async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(2 * 3).toBe(6);
  });

  test.concurrent('concurrent test 3', async () => {
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(10 / 2).toBe(5);
  });

  test('regular test', () => {
    expect(true).toBe(true);
  });
});
