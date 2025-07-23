// Performance comparison test
let startTime;

beforeAll(async () => {
  console.log('SETUP: Initializing test environment');
  startTime = Date.now();
  await new Promise(resolve => setTimeout(resolve, 50)); // Setup time
});

afterAll(async () => {
  const totalTime = Date.now() - startTime;
  console.log(`TEARDOWN: Total execution time: ${totalTime}ms`);
});

test('slow test 1', async () => {
  console.log(`TEST_1: Starting at ${new Date().toISOString()}`);
  await new Promise(resolve => setTimeout(resolve, 200));
  console.log(`TEST_1: Completed at ${new Date().toISOString()}`);
  expect(true).toBe(true);
});

test('slow test 2', async () => {
  console.log(`TEST_2: Starting at ${new Date().toISOString()}`);
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log(`TEST_2: Completed at ${new Date().toISOString()}`);
  expect(true).toBe(true);
});

test('slow test 3', async () => {
  console.log(`TEST_3: Starting at ${new Date().toISOString()}`);
  await new Promise(resolve => setTimeout(resolve, 150));
  console.log(`TEST_3: Completed at ${new Date().toISOString()}`);
  expect(true).toBe(true);
});

test('slow test 4', async () => {
  console.log(`TEST_4: Starting at ${new Date().toISOString()}`);
  await new Promise(resolve => setTimeout(resolve, 250));
  console.log(`TEST_4: Completed at ${new Date().toISOString()}`);
  expect(true).toBe(true);
});
