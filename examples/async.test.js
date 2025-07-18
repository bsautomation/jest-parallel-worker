// Async test examples to test parallel execution with promises and timeouts
describe('Async Operations', () => {
  it('should resolve a simple promise', async () => {
    const result = await Promise.resolve('success');
    expect(result).toBe('success');
  });

  it('should handle promise rejection', async () => {
    await expect(Promise.reject(new Error('failed'))).rejects.toThrow('failed');
  });

  it('should work with setTimeout', (done) => {
    setTimeout(() => {
      expect(true).toBe(true);
      done();
    }, 100);
  });

  it('should simulate API call', async () => {
    const mockApiCall = () => new Promise(resolve => {
      setTimeout(() => resolve({ data: 'api response' }), 200);
    });

    const result = await mockApiCall();
    expect(result.data).toBe('api response');
  });

  it('should handle multiple promises', async () => {
    const promises = [
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.resolve(3)
    ];

    const results = await Promise.all(promises);
    expect(results).toEqual([1, 2, 3]);
  });

  it('should timeout after delay', async () => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(150);
    expect(true).toBe(true);
  });

  it('should work with async/await and fetch simulation', async () => {
    const mockFetch = async (url) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return {
        json: async () => ({ url, status: 'ok' })
      };
    };

    const response = await mockFetch('https://api.example.com');
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});

describe('Complex Async Scenarios', () => {
  it('should handle nested async operations', async () => {
    const level1 = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'level1';
    };

    const level2 = async () => {
      const result1 = await level1();
      await new Promise(resolve => setTimeout(resolve, 50));
      return result1 + '-level2';
    };

    const final = await level2();
    expect(final).toBe('level1-level2');
  });

  it('should work with Promise.race', async () => {
    const fast = new Promise(resolve => setTimeout(() => resolve('fast'), 50));
    const slow = new Promise(resolve => setTimeout(() => resolve('slow'), 200));

    const winner = await Promise.race([fast, slow]);
    expect(winner).toBe('fast');
  });

  it('should handle error in async chain', async () => {
    const chainWithError = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      throw new Error('Chain error');
    };

    await expect(chainWithError()).rejects.toThrow('Chain error');
  });
});