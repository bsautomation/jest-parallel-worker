
const fs = require('fs');
const path = require('path');

let beforeAllCounter = 0;
let beforeEachCounter = 0;

describe('Hook Test File 2', () => {
  beforeAll(() => {
    beforeAllCounter++;
    const logFile = path.join(__dirname, 'hook-log-2.txt');
    const logEntry = `beforeAll-${fileNumber}-${beforeAllCounter}-${Date.now()}\n`;
    fs.appendFileSync(logFile, logEntry);
    console.log(`[FILE2] beforeAll executed #${beforeAllCounter}`);
    return new Promise(resolve => setTimeout(resolve, 50));
  });

  beforeEach(() => {
    beforeEachCounter++;
    console.log(`[FILE2] beforeEach executed #${beforeEachCounter}`);
  });

  afterAll(() => {
    const logFile = path.join(__dirname, 'hook-log-2.txt');
    const logEntry = `afterAll-${fileNumber}-${Date.now()}\n`;
    fs.appendFileSync(logFile, logEntry);
    console.log(`[FILE2] afterAll executed`);
  });

  it('should verify beforeAll counter in file 2 - test 1', () => {
    expect(beforeAllCounter).toBe(1);
    expect(beforeEachCounter).toBe(1);
  });

  it('should verify beforeAll counter in file 2 - test 2', () => {
    expect(beforeAllCounter).toBe(1); // Should still be 1
    expect(beforeEachCounter).toBe(2);
  });

  it('should verify beforeAll counter in file 2 - test 3', () => {
    expect(beforeAllCounter).toBe(1); // Should still be 1
    expect(beforeEachCounter).toBe(3);
  });

  it('should verify beforeAll counter in file 2 - test 4', () => {
    expect(beforeAllCounter).toBe(1); // Should still be 1
    expect(beforeEachCounter).toBe(4);
  });
});
