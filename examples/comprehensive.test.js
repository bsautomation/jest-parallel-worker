// Complex test file to demonstrate parallel execution capabilities
describe('Mathematical Operations', () => {
  beforeEach(() => {
    // Setup that runs before each test
    console.log('Setting up math test');
  });

  it('should add two positive numbers', () => {
    const result = 5 + 3;
    expect(result).toBe(8);
  });

  it('should subtract numbers correctly', () => {
    const result = 10 - 4;
    expect(result).toBe(6);
  });

  it('should multiply numbers', () => {
    const result = 7 * 6;
    expect(result).toBe(42);
  });

  it('should divide numbers', () => {
    const result = 15 / 3;
    expect(result).toBe(5);
  });

  it('should handle floating point arithmetic', () => {
    const result = 0.1 + 0.2;
    expect(result).toBeCloseTo(0.3);
  });

  it('should calculate square root', () => {
    const result = Math.sqrt(16);
    expect(result).toBe(4);
  });

  it('should handle negative numbers', () => {
    const result = -5 + 3;
    expect(result).toBe(-2);
  });

  it('should calculate power', () => {
    const result = Math.pow(2, 3);
    expect(result).toBe(8);
  });
});

describe('Array Operations', () => {
  let testArray;

  beforeEach(() => {
    testArray = [1, 2, 3, 4, 5];
  });

  it('should find array length', () => {
    expect(testArray.length).toBe(5);
  });

  it('should push elements to array', () => {
    testArray.push(6);
    expect(testArray).toContain(6);
    expect(testArray.length).toBe(6);
  });

  it('should pop elements from array', () => {
    const popped = testArray.pop();
    expect(popped).toBe(5);
    expect(testArray.length).toBe(4);
  });

  it('should find element in array', () => {
    const index = testArray.indexOf(3);
    expect(index).toBe(2);
  });

  it('should filter array elements', () => {
    const evenNumbers = testArray.filter(n => n % 2 === 0);
    expect(evenNumbers).toEqual([2, 4]);
  });

  it('should map array elements', () => {
    const doubled = testArray.map(n => n * 2);
    expect(doubled).toEqual([2, 4, 6, 8, 10]);
  });

  it('should reduce array to sum', () => {
    const sum = testArray.reduce((acc, val) => acc + val, 0);
    expect(sum).toBe(15);
  });
});