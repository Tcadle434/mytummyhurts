import {
  CONCERN_MAX_CONCURRENT_RUNS,
  CONCERN_MAX_QUEUED_RUNS,
  CONCERN_QUEUE_TIMEOUT_MS,
} from './config';

type Release = () => void;
type Waiter = {
  resolve: (release: Release | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ConcernShadowScheduler {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
    private readonly queueTimeoutMs: number,
  ) {}

  private release(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(this.release());
        return;
      }
      this.active = Math.max(0, this.active - 1);
    };
  }

  acquire(): Promise<Release | null> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve(this.release());
    }
    if (this.waiters.length >= this.maxQueued) return Promise.resolve(null);
    return new Promise((resolve) => {
      const waiter: Waiter = {
        resolve,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          resolve(null);
        }, this.queueTimeoutMs),
      };
      this.waiters.push(waiter);
    });
  }
}

const concernShadowScheduler = new ConcernShadowScheduler(
  CONCERN_MAX_CONCURRENT_RUNS,
  CONCERN_MAX_QUEUED_RUNS,
  CONCERN_QUEUE_TIMEOUT_MS,
);

export function acquireConcernShadowSlot() {
  return concernShadowScheduler.acquire();
}
