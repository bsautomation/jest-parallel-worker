// Simple test file to verify AST parsing works
describe('Basic Tests', () => {
  it('should work with normal test', () => {
    expect(true).toBe(true);
  });

  it('should work with number test', () => {
    expect(2 + 2).toBe(4);
  });
});

describe('String Tests', () => {
  test('should handle string operations', () => {
    expect('hello'.toUpperCase()).toBe('HELLO');
  });

  it('should concatenate strings', () => {
    expect('a' + 'b').toBe('ab');
  });
});

// Simple test file for testing HTML report generation
describe('Simple Test Suite', () => {
  test('should pass - basic assertion', () => {
    expect(2 + 2).toBe(4);
  });

  test('should pass - string assertion', () => {
    expect('hello').toBe('hello');
  });

  test('should fail - intentional failure', () => {
    expect(1 + 1).toBe(3); // This will fail
  });

  test('should pass - array assertion', () => {
    expect([1, 2, 3]).toContain(2);
  });

  test('should pass - object assertion', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj).toHaveProperty('name', 'test');
  });
});