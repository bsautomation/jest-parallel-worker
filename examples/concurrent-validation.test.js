// Test file with concurrent tests to validate true parallel execution
describe('Single File TRUE Parallel Validation', () => {
  beforeAll(() => {
    console.log('=== beforeAll: Setup started ===');
  });

  test.concurrent('Concurrent Test 1 - 1 second delay', async () => {
    const start = Date.now();
    console.log(`Concurrent Test 1 started at: ${start}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const end = Date.now();
    console.log(`Concurrent Test 1 completed at: ${end} (duration: ${end - start}ms)`);
    expect(true).toBe(true);
  });

  test.concurrent('Concurrent Test 2 - 1 second delay', async () => {
    const start = Date.now();
    console.log(`Concurrent Test 2 started at: ${start}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const end = Date.now();
    console.log(`Concurrent Test 2 completed at: ${end} (duration: ${end - start}ms)`);
    expect(true).toBe(true);
  });

  test.concurrent('Concurrent Test 3 - 1 second delay', async () => {
    const start = Date.now();
    console.log(`Concurrent Test 3 started at: ${start}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const end = Date.now();
    console.log(`Concurrent Test 3 completed at: ${end} (duration: ${end - start}ms)`);
    expect(true).toBe(true);
  });

  test.concurrent('Concurrent Test 4 - 1 second delay', async () => {
    const start = Date.now();
    console.log(`Concurrent Test 4 started at: ${start}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const end = Date.now();
    console.log(`Concurrent Test 4 completed at: ${end} (duration: ${end - start}ms)`);
    expect(true).toBe(true);
  });

  afterAll(() => {
    console.log('=== afterAll: Cleanup completed ===');
  });
});
