describe('Mixed test results', () => {
  test('should pass', () => {
    expect(1 + 1).toBe(2);
  });

  test('should fail', () => {
    expect(true).toBe(false);
  });

  test.skip('should be skipped', () => {
    expect(true).toBe(false); // This would fail if run
  });

  test('should also pass', () => {
    expect(2 + 2).toBe(4);
  });

  it.skip('another skipped test', () => {
    throw new Error('This should not run');
  });

  test('should also fail', () => {
    expect('hello').toBe('world');
  });
});
