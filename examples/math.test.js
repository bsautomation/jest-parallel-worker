const { add, subtract, multiply, divide, asyncCalculation } = require('./utils/math-utils');

// Example test file with multiple test cases
describe('Math Operations', () => {
  beforeAll(() => {
    console.log('Math Operations - beforeAll hook executed');
  });

  afterAll(() => {
    console.log('Math Operations - afterAll hook executed');
  });

  beforeEach(() => {
    console.log('Math Operations - beforeEach hook executed');
  });

  afterEach(() => {
    console.log('Math Operations - afterEach hook executed');
  });

  it('should add two numbers correctly', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('should subtract two numbers correctly', () => {
    expect(subtract(5, 3)).toBe(2);
  });

  it('should multiply two numbers correctly', () => {
    expect(multiply(4, 3)).toBe(12);
  });

  it('should divide two numbers correctly', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('should handle async operations', async () => {
    const result = await asyncCalculation(42, 100);
    expect(result).toBe(42);
  });
});
