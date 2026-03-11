export type SyncFn = () => Promise<void>;

export class PollingSync {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly syncFn: SyncFn,
    private readonly intervalMs: number = Number(process.env.EXPO_PUBLIC_SYNC_INTERVAL_MS ?? 20000)
  ) {}

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.syncFn();
    }, this.intervalMs);
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  async refreshNow() {
    await this.syncFn();
  }
}
