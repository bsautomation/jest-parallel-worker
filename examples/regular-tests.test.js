describe('Regular Tests (it/test)', () => {
  test('regular test 1', () => {
    // Simulate some work
    const start = Date.now();
    while (Date.now() - start < 100) {} // 100ms of work
    expect(1 + 1).toBe(2);
  });

  test('regular test 2', () => {
    // Simulate some work
    const start = Date.now();
    while (Date.now() - start < 150) {} // 150ms of work
    expect(2 * 3).toBe(6);
  });

  test('regular test 3', () => {
    // Simulate some work
    const start = Date.now();
    while (Date.now() - start < 80) {} // 80ms of work
    expect(10 / 2).toBe(5);
  });

  test('regular test 4', () => {
    // Simulate some work
    const start = Date.now();
    while (Date.now() - start < 120) {} // 120ms of work
    expect(4 * 4).toBe(16);
  });
});
