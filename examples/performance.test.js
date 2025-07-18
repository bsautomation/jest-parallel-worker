// Performance test file to demonstrate parallel execution benefits
describe('Performance Tests', () => {
  it('should measure execution time 1', () => {
    const start = Date.now();
    // Simulate some work
    let sum = 0;
    for (let i = 0; i < 1000000; i++) {
      sum += i;
    }
    const duration = Date.now() - start;
    console.log(`Test 1 took ${duration}ms, sum: ${sum}`);
    expect(sum).toBeGreaterThan(0);
  });

  it('should measure execution time 2', () => {
    const start = Date.now();
    // Simulate different work
    let product = 1;
    for (let i = 1; i < 1000; i++) {
      product = (product * i) % 1000000;
    }
    const duration = Date.now() - start;
    console.log(`Test 2 took ${duration}ms, product: ${product}`);
    expect(product).toBeGreaterThan(0);
  });

  it('should perform string operations', () => {
    const start = Date.now();
    let result = '';
    for (let i = 0; i < 10000; i++) {
      result += `item-${i}-`;
    }
    const duration = Date.now() - start;
    console.log(`String test took ${duration}ms, length: ${result.length}`);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should perform array operations', () => {
    const start = Date.now();
    const array = Array.from({ length: 10000 }, (_, i) => i);
    const filtered = array.filter(n => n % 2 === 0);
    const mapped = filtered.map(n => n * 2);
    const reduced = mapped.reduce((sum, n) => sum + n, 0);
    const duration = Date.now() - start;
    console.log(`Array test took ${duration}ms, result: ${reduced}`);
    expect(reduced).toBeGreaterThan(0);
  });

  it('should simulate I/O operations', async () => {
    const start = Date.now();
    
    // Simulate multiple I/O operations
    const operations = Array.from({ length: 5 }, (_, i) => 
      new Promise(resolve => setTimeout(() => resolve(i * 10), 100 + i * 20))
    );
    
    const results = await Promise.all(operations);
    const duration = Date.now() - start;
    console.log(`I/O test took ${duration}ms, results: ${results}`);
    expect(results).toHaveLength(5);
  });

  it('should test CPU intensive task', () => {
    const start = Date.now();
    
    // Prime number calculation
    const isPrime = (num) => {
      if (num < 2) return false;
      for (let i = 2; i <= Math.sqrt(num); i++) {
        if (num % i === 0) return false;
      }
      return true;
    };

    const primes = [];
    for (let i = 2; i < 1000; i++) {
      if (isPrime(i)) primes.push(i);
    }
    
    const duration = Date.now() - start;
    console.log(`Prime test took ${duration}ms, found ${primes.length} primes`);
    expect(primes.length).toBeGreaterThan(0);
  });
});

describe('Memory Usage Tests', () => {
  it('should create large objects', () => {
    const largeObject = {
      data: Array.from({ length: 50000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 1000
      }))
    };

    expect(largeObject.data).toHaveLength(50000);
    console.log(`Created object with ${largeObject.data.length} items`);
  });

  it('should handle large arrays', () => {
    const largeArray = new Array(100000).fill().map((_, i) => i * 2);
    const sum = largeArray.reduce((acc, val) => acc + val, 0);
    
    expect(largeArray).toHaveLength(100000);
    expect(sum).toBeGreaterThan(0);
    console.log(`Array sum: ${sum}`);
  });

  it('should process large strings', () => {
    let largeString = '';
    for (let i = 0; i < 10000; i++) {
      largeString += `This is line ${i} with some content that makes it longer.\n`;
    }

    const lineCount = largeString.split('\n').length - 1;
    expect(lineCount).toBe(10000);
    console.log(`Created string with ${largeString.length} characters`);
  });
});