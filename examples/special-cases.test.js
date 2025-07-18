// Test file with skipped and focused tests to test discovery capabilities
describe('Skip and Focus Tests', () => {
  it('should run this normal test', () => {
    expect(true).toBe(true);
  });

  it.skip('should skip this test', () => {
    // This test should be skipped
    expect(false).toBe(true);
  });

  xit('should also skip this test', () => {
    // This test should also be skipped
    throw new Error('This should not run');
  });

  test('should run this test function', () => {
    expect('test').toBe('test');
  });

  test.skip('should skip this test function', () => {
    throw new Error('This should not run');
  });

  // Uncomment to test .only functionality (will run only these tests)
  // it.only('should only run this test when .only is used', () => {
  //   expect(true).toBe(true);
  // });

  // fit('should also only run when focused', () => {
  //   expect(true).toBe(true);
  // });
});

describe('Edge Cases', () => {
  it('should handle empty test', () => {
    // Empty test body
  });

  it('should handle test with just expect', () => {
    expect(1).toBe(1);
  });

  it('should work with multiple expects', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toMatch(/ell/);
    expect([1, 2, 3]).toContain(2);
    expect({ name: 'test' }).toHaveProperty('name');
  });

  it('should handle complex objects', () => {
    const complexObject = {
      id: 1,
      name: 'Test Object',
      metadata: {
        created: new Date('2023-01-01'),
        tags: ['test', 'example'],
        config: {
          enabled: true,
          settings: {
            timeout: 5000,
            retries: 3
          }
        }
      }
    };

    expect(complexObject.metadata.tags).toHaveLength(2);
    expect(complexObject.metadata.config.settings.timeout).toBe(5000);
  });

  it('should work with regex matching', () => {
    const testString = 'Hello World 123';
    expect(testString).toMatch(/Hello/);
    expect(testString).toMatch(/\d+/);
    expect(testString).not.toMatch(/goodbye/i);
  });
});

describe('Error Handling Tests', () => {
  it('should pass when expecting error to be thrown', () => {
    const throwError = () => {
      throw new Error('Expected error');
    };

    expect(throwError).toThrow('Expected error');
  });

  it('should handle different error types', () => {
    const throwTypeError = () => {
      throw new TypeError('Type error');
    };

    expect(throwTypeError).toThrow(TypeError);
  });

  it('should test error message patterns', () => {
    const throwCustomError = () => {
      throw new Error('Custom error with code 404');
    };

    expect(throwCustomError).toThrow(/code \d+/);
  });
});