// Test file for validating custom runner intra-file parallelism
let sharedCounter = 0;
let beforeAllExecuted = false;
let afterAllExecuted = false;

beforeAll(async () => {
  console.log('BEFORE_ALL: Setting up shared resources');
  beforeAllExecuted = true;
  sharedCounter = 100;
  // Simulate some setup time
  await new Promise(resolve => setTimeout(resolve, 100));
});

afterAll(async () => {
  console.log('AFTER_ALL: Cleaning up shared resources');
  afterAllExecuted = true;
  sharedCounter = 0;
  // Simulate some cleanup time
  await new Promise(resolve => setTimeout(resolve, 50));
});

test('test 1 - should have access to shared state', async () => {
  console.log(`TEST_1: Starting at ${new Date().toISOString()}, counter=${sharedCounter}`);
  expect(beforeAllExecuted).toBe(true);
  expect(sharedCounter).toBe(100);
  
  // Simulate test work
  await new Promise(resolve => setTimeout(resolve, 200));
  
  console.log(`TEST_1: Completed at ${new Date().toISOString()}`);
});

test('test 2 - should run in parallel with test 1', async () => {
  console.log(`TEST_2: Starting at ${new Date().toISOString()}, counter=${sharedCounter}`);
  expect(beforeAllExecuted).toBe(true);
  expect(sharedCounter).toBe(100);
  
  // Simulate test work
  await new Promise(resolve => setTimeout(resolve, 300));
  
  console.log(`TEST_2: Completed at ${new Date().toISOString()}`);
});

test('test 3 - should also run in parallel', async () => {
  console.log(`TEST_3: Starting at ${new Date().toISOString()}, counter=${sharedCounter}`);
  expect(beforeAllExecuted).toBe(true);
  expect(sharedCounter).toBe(100);
  
  // Simulate test work
  await new Promise(resolve => setTimeout(resolve, 150));
  
  console.log(`TEST_3: Completed at ${new Date().toISOString()}`);
});

test('test 4 - validates parallel execution timing', async () => {
  console.log(`TEST_4: Starting at ${new Date().toISOString()}, counter=${sharedCounter}`);
  expect(beforeAllExecuted).toBe(true);
  expect(sharedCounter).toBe(100);
  
  // Simulate test work
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`TEST_4: Completed at ${new Date().toISOString()}`);
});
