export class GameLoop {
  private frame = 0;
  private previous = 0;
  private accumulator = 0;
  private running = false;
  private readonly stepSeconds = 1 / 60;
  private readonly maxFrameSeconds = 0.1;

  constructor(
    private readonly update: (stepSeconds: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  private readonly tick = (time: number) => {
    if (!this.running) return;
    const current = time / 1000;
    const elapsed = this.previous === 0 ? 0 : Math.min(current - this.previous, this.maxFrameSeconds);
    this.previous = current;
    this.accumulator += elapsed;
    while (this.accumulator >= this.stepSeconds) {
      this.update(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
    }
    this.render(this.accumulator / this.stepSeconds);
    this.frame = requestAnimationFrame(this.tick);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.previous = 0;
    this.accumulator = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.previous = 0;
    this.accumulator = 0;
  }
}
