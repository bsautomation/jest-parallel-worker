// Memory intensive test file to demonstrate memory tracking
describe('Memory Consumption Tests', () => {
  it('should allocate small memory', () => {
    const smallArray = new Array(1000).fill('test');
    expect(smallArray.length).toBe(1000);
  });

  it('should allocate medium memory', () => {
    const mediumArray = new Array(10000).fill().map((_, i) => ({
      id: i,
      data: `item-${i}`,
      timestamp: Date.now()
    }));
    expect(mediumArray.length).toBe(10000);
  });

  it('should allocate large memory', () => {
    const largeArray = new Array(50000).fill().map((_, i) => ({
      id: i,
      data: `large-item-${i}`,
      content: new Array(100).fill(`content-${i}`).join(' '),
      metadata: {
        created: new Date(),
        index: i,
        tags: new Array(10).fill(`tag-${i}`)
      }
    }));
    expect(largeArray.length).toBe(50000);
  });

  it('should create and cleanup memory', () => {
    let tempData = new Array(20000).fill().map(() => ({
      buffer: Buffer.alloc(1024), // 1KB per item
      data: Math.random().toString(36)
    }));
    
    expect(tempData.length).toBe(20000);
    
    // Cleanup
    tempData = null;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    expect(true).toBe(true);
  });

  it('should test string concatenation memory', () => {
    let bigString = '';
    for (let i = 0; i < 10000; i++) {
      bigString += `This is line ${i} with some content that makes it longer and uses more memory.\n`;
    }
    
    expect(bigString.length).toBeGreaterThan(0);
  });

  it('should test object creation memory', () => {
    const objects = [];
    for (let i = 0; i < 5000; i++) {
      objects.push({
        id: i,
        name: `Object ${i}`,
        data: new Array(50).fill(i),
        metadata: {
          created: new Date(),
          properties: {
            type: 'test',
            category: `category-${i % 10}`,
            attributes: new Array(20).fill(`attr-${i}`)
          }
        }
      });
    }
    
    expect(objects.length).toBe(5000);
  });
});

describe('Memory Leak Detection Tests', () => {
  it('should handle memory cleanup properly', () => {
    const initialMemory = process.memoryUsage();
    
    // Create temporary memory usage
    const tempArrays = [];
    for (let i = 0; i < 100; i++) {
      tempArrays.push(new Array(1000).fill(`temp-${i}`));
    }
    
    expect(tempArrays.length).toBe(100);
    
    // Clear references
    tempArrays.length = 0;
    
    // The memory should be available for cleanup
    expect(true).toBe(true);
  });

  it('should demonstrate closure memory retention', () => {
    function createClosure(data) {
      const localData = new Array(1000).fill(data);
      return function() {
        return localData.length;
      };
    }
    
    const closures = [];
    for (let i = 0; i < 10; i++) {
      closures.push(createClosure(`closure-data-${i}`));
    }
    
    const result = closures[0]();
    expect(result).toBe(1000);
  });
});