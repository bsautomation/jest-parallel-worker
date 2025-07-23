// Hook behavior demonstration test for comparison
describe('Hook Behavior Comparison', () => {
  let setupCounter = 0;
  let testCounter = 0;

  beforeAll(() => {
    setupCounter++;
    console.log(`beforeAll executed, setupCounter: ${setupCounter}`);
  });

  beforeEach(() => {
    testCounter++;
    console.log(`beforeEach executed, testCounter: ${testCounter}`);
  });

  test('should run test 1', () => {
    console.log(`Test 1 - setupCounter: ${setupCounter}, testCounter: ${testCounter}`);
    expect(setupCounter).toBe(1); // beforeAll should run only once
  });

  test('should run test 2', () => {
    console.log(`Test 2 - setupCounter: ${setupCounter}, testCounter: ${testCounter}`);
    expect(setupCounter).toBe(1); // beforeAll should still be 1
  });

  test('should run test 3', () => {
    console.log(`Test 3 - setupCounter: ${setupCounter}, testCounter: ${testCounter}`);
    expect(setupCounter).toBe(1); // beforeAll should still be 1
  });

  test('should run test 4', () => {
    console.log(`Test 4 - setupCounter: ${setupCounter}, testCounter: ${testCounter}`);
    expect(setupCounter).toBe(1); // beforeAll should still be 1
  });

  afterAll(() => {
    console.log(`afterAll executed, final setupCounter: ${setupCounter}, testCounter: ${testCounter}`);
  });
});
