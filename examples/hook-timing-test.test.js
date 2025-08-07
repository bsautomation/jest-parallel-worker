describe('Hook Timing Tests', () => {
  beforeAll(async () => {
    console.log('beforeAll starting');
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
    console.log('beforeAll completed');
  });

  test('test 1', () => {
    expect(1 + 1).toBe(2);
  });

  test('test 2', () => {
    expect(2 + 2).toBe(4);
  });
});
