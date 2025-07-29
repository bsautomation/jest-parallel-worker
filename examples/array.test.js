const { pushElement, popElement, getArrayLength, mapArray, filterArray } = require('./utils/array-utils');

// Example test file with array operations
describe('Array Operations', () => {
  beforeAll(() => {
    console.log('Array Operations - beforeAll hook executed');
  });

  afterAll(() => {
    console.log('Array Operations - afterAll hook executed');
  });

  it('should push elements to array', () => {
    const result = pushElement([1, 2, 3], 4);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('should pop elements from array', () => {
    const result = popElement([1, 2, 3, 4]);
    expect(result.element).toBe(4);
    expect(result.array).toEqual([1, 2, 3]);
  });

  it('should find array length', () => {
    const length = getArrayLength([1, 2, 3, 4, 5]);
    expect(length).toBe(5);
  });

  it('should map array elements', () => {
    const doubled = mapArray([1, 2, 3], x => x * 2);
    expect(doubled).toEqual([2, 4, 6]);
  });

  it('should filter array elements', () => {
    const evens = filterArray([1, 2, 3, 4, 5], x => x % 2 === 0);
    expect(evens).toEqual([2, 4]);
  });
});
