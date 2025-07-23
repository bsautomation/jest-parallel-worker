// Test file to validate parallel execution within a single file
describe('Single File Parallel Validation', () => {
  beforeAll(() => {
    console.log('=== beforeAll: Setup started ===');
  });

  test('Test 1 - 1 second delay', async () => {
    const start = Date.now();
    console.log(`Test 1 started at: ${start}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const end = Date.now();
    console.log(`Test 1 completed at: ${end} (duration: ${end - start}ms)`);
    expect(true).toBe(true);
  });

  test('Test 2 - 1 second delay', async () => {
    const start = Date.now();
    console.log(`Test 2 started at: ${start}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const end = Date.now();
    console.log(`Test 2 completed at: ${end} (duration: ${end - start}ms)`);
    expect(true).toBe(true);
  });

  test('Test 3 - 1 second delay', async () => {
    const start = Date.now();
    console.log(`Test 3 started at: ${start}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const end = Date.now();
    console.log(`Test 3 completed at: ${end} (duration: ${end - start}ms)`);
    expect(true).toBe(true);
  });

  test('Test 4 - 1 second delay', async () => {
    const start = Date.now();
    console.log(`Test 4 started at: ${start}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const end = Date.now();
    console.log(`Test 4 completed at: ${end} (duration: ${end - start}ms)`);
    expect(true).toBe(true);
  });

  afterAll(() => {
    console.log('=== afterAll: Cleanup completed ===');
  });
});
