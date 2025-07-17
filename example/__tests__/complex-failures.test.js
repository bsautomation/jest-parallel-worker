/**
 * Complex failure scenarios for testing jest-parallel-worker error reporting
 */

describe('Complex Failure Scenarios', () => {
  // Test with async/await and rejection
  it('should handle rejected promises @p0', async () => {
    await expect(Promise.reject(new Error('Async operation failed'))).resolves.toBe(true);
  });

  // Test with snapshot failure
  it('should show detailed snapshot failures @p0', () => {
    expect({
      complex: {
        nested: {
          object: {
            with: {
              deep: {
                properties: [1, 2, 3, 4, 5]
              }
            }
          }
        }
      }
    }).toMatchInlineSnapshot(`
      Object {
        "complex": Object {
          "nested": Object {
            "object": Object {
              "with": Object {
                "deep": Object {
                  "properties": Array [
                    1,
                    2,
                    3,
                  ],
                },
              },
            },
          },
        },
      }
    `);
  });

  // Test with timeout in beforeEach
  describe('Suite with setup problems', () => {
    beforeEach(async () => {
      // This will cause the test to timeout if timeout is set too low
      await new Promise(resolve => setTimeout(resolve, 3000));
    });

    it('should timeout in setup @timeout', () => {
      // This test will time out in the beforeEach
      expect(true).toBe(true);
    });
  });

  // Test with assertion on async results
  it('should handle async matchers @p0', async () => {
    const fetchData = () => Promise.resolve({ status: 404 });
    const response = await fetchData();
    
    // This will fail with HTTP status assertion
    expect(response.status).toBe(200);
  });
});

// Suite with multiple related failures
describe('HTTP Response Testing', () => {
  const mockResponses = [
    { url: '/api/users', status: 404, body: { error: 'Not Found' } },
    { url: '/api/products', status: 403, body: { error: 'Forbidden' } },
    { url: '/api/orders', status: 500, body: { error: 'Server Error' } }
  ];

  mockResponses.forEach(mock => {
    it(`should handle ${mock.url} endpoint correctly @p0`, () => {
      // All of these will fail with different status codes
      expect(mock.status).toBe(200);
    });
  });
  
  // Test with mock function assertions
  it('should report mock function call issues @p0', () => {
    const mockFn = jest.fn();
    mockFn('wrong arg');
    
    // This will fail with detailed mock expectations
    expect(mockFn).toHaveBeenCalledWith('expected arg');
  });
});