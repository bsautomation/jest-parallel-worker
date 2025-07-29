// Test file to validate that beforeAll/afterAll hooks run only once in parallel mode
let beforeAllCallCount = 0;
let afterAllCallCount = 0;
let setupValue = null;

describe('Hooks Validation in Parallel Execution', () => {
  beforeAll(() => {
    beforeAllCallCount++;
    setupValue = 'setup-complete';
    console.log(`beforeAll called (count: ${beforeAllCallCount}) - setupValue: ${setupValue}`);
  });

  test('Test 1 - Check setup value and increment', async () => {
    const start = Date.now();
    console.log(`Test 1 started at: ${start}, setupValue: ${setupValue}, beforeAllCallCount: ${beforeAllCallCount}`);
    
    // Verify setup was done
    expect(setupValue).toBe('setup-complete');
    expect(beforeAllCallCount).toBe(1);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    const end = Date.now();
    console.log(`Test 1 completed at: ${end} (duration: ${end - start}ms)`);
  });

  test('Test 2 - Check setup value and increment', async () => {
    const start = Date.now();
    console.log(`Test 2 started at: ${start}, setupValue: ${setupValue}, beforeAllCallCount: ${beforeAllCallCount}`);
    
    // Verify setup was done only once
    expect(setupValue).toBe('setup-complete');
    expect(beforeAllCallCount).toBe(1);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    const end = Date.now();
    console.log(`Test 2 completed at: ${end} (duration: ${end - start}ms)`);
  });

  test('Test 3 - Check setup value and increment', async () => {
    const start = Date.now();
    console.log(`Test 3 started at: ${start}, setupValue: ${setupValue}, beforeAllCallCount: ${beforeAllCallCount}`);
    
    // Verify setup was done only once
    expect(setupValue).toBe('setup-complete');
    expect(beforeAllCallCount).toBe(1);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    const end = Date.now();
    console.log(`Test 3 completed at: ${end} (duration: ${end - start}ms)`);
  });

  test('Test 4 - Check setup value and increment', async () => {
    const start = Date.now();
    console.log(`Test 4 started at: ${start}, setupValue: ${setupValue}, beforeAllCallCount: ${beforeAllCallCount}`);
    
    // Verify setup was done only once
    expect(setupValue).toBe('setup-complete');
    expect(beforeAllCallCount).toBe(1);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    const end = Date.now();
    console.log(`Test 4 completed at: ${end} (duration: ${end - start}ms)`);
  });

  afterAll(() => {
    afterAllCallCount++;
    console.log(`afterAll called (count: ${afterAllCallCount})`);
  });
});
