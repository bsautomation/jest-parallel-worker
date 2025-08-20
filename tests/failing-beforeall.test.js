describe('BeforeAll Failure Test Suite', () => {
  beforeAll(() => {
    console.log('BeforeAll hook started');
    // Simulate a failure
    throw new Error('Database connection failed in beforeAll');
  });

  test('should never run because beforeAll failed', () => {
    expect(true).toBe(true);
  });

  test('this test also will not run', () => {
    expect(1 + 1).toBe(2);
  });
});
