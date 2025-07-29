describe('Sequential vs Concurrent Demo', () => {
  test('sequential test 1', async () => {
    console.log('Sequential test 1 started at', Date.now());
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms async wait
    console.log('Sequential test 1 finished at', Date.now());
    expect(1).toBe(1);
  });

  test('sequential test 2', async () => {
    console.log('Sequential test 2 started at', Date.now());
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms async wait
    console.log('Sequential test 2 finished at', Date.now());
    expect(2).toBe(2);
  });

  test.concurrent('concurrent test 1', async () => {
    console.log('Concurrent test 1 started at', Date.now());
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms async wait
    console.log('Concurrent test 1 finished at', Date.now());
    expect(3).toBe(3);
  });

  test.concurrent('concurrent test 2', async () => {
    console.log('Concurrent test 2 started at', Date.now());
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms async wait
    console.log('Concurrent test 2 finished at', Date.now());
    expect(4).toBe(4);
  });
});
