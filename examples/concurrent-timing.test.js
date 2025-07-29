// Test file to verify concurrent test execution within a file
describe('Concurrent Execution Test', () => {
  let startTime;
  
  beforeAll(() => {
    startTime = Date.now();
    console.log(`[BEFOREALL] Started at ${new Date().toISOString()}`);
  });

  afterAll(() => {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[AFTERALL] Completed at ${new Date().toISOString()}, total duration: ${duration}ms`);
  });

  test.concurrent('should run concurrent test 1 with delay', async () => {
    const testStart = Date.now();
    console.log(`[CONCURRENT TEST 1] Started at ${new Date().toISOString()}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    
    const testEnd = Date.now();
    console.log(`[CONCURRENT TEST 1] Completed at ${new Date().toISOString()}, duration: ${testEnd - testStart}ms`);
    expect(true).toBe(true);
  });

  test.concurrent('should run concurrent test 2 with delay', async () => {
    const testStart = Date.now();
    console.log(`[CONCURRENT TEST 2] Started at ${new Date().toISOString()}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    
    const testEnd = Date.now();
    console.log(`[CONCURRENT TEST 2] Completed at ${new Date().toISOString()}, duration: ${testEnd - testStart}ms`);
    expect(true).toBe(true);
  });

  test.concurrent('should run concurrent test 3 with delay', async () => {
    const testStart = Date.now();
    console.log(`[CONCURRENT TEST 3] Started at ${new Date().toISOString()}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    
    const testEnd = Date.now();
    console.log(`[CONCURRENT TEST 3] Completed at ${new Date().toISOString()}, duration: ${testEnd - testStart}ms`);
    expect(true).toBe(true);
  });

  test.concurrent('should run concurrent test 4 with delay', async () => {
    const testStart = Date.now();
    console.log(`[CONCURRENT TEST 4] Started at ${new Date().toISOString()}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    
    const testEnd = Date.now();
    console.log(`[CONCURRENT TEST 4] Completed at ${new Date().toISOString()}, duration: ${testEnd - testStart}ms`);
    expect(true).toBe(true);
  });

  test.concurrent('should run concurrent test 5 with delay', async () => {
    const testStart = Date.now();
    console.log(`[CONCURRENT TEST 5] Started at ${new Date().toISOString()}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    
    const testEnd = Date.now();
    console.log(`[CONCURRENT TEST 5] Completed at ${new Date().toISOString()}, duration: ${testEnd - testStart}ms`);
    expect(true).toBe(true);
  });
});
