/**
 * Minimal p-limit-style semaphore. Returns a function that wraps async tasks
 * and ensures no more than `n` of them run at the same time. Pending tasks
 * queue in FIFO order.
 *
 * Kept here (instead of pulling the `p-limit` package) to avoid an extra
 * dependency in the runner image.
 */
export function pLimit(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  const concurrency = Math.max(1, Math.floor(n));
  let active = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = (): void => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      queue.push(start);
      next();
    });
}
