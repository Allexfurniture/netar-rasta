export type InputSnapshot = Readonly<{
  steer: number;
  accelerate: boolean;
  reverse: boolean;
  brake: boolean;
  horn: boolean;
  boost: boolean;
  pause: boolean;
}>;

type TouchKey = 'left' | 'right' | 'accelerate' | 'reverse' | 'brake' | 'boost';

export class InputController {
  private readonly keys = new Set<string>();
  private readonly touch = new Set<TouchKey>();
  private hornPressed = false;
  private pausePressed = false;
  private disposed = false;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'escape', 'shift', 'x'].includes(key)) event.preventDefault();
    if (key === ' ' && !this.keys.has(key)) this.hornPressed = true;
    if (key === 'escape' && !this.keys.has(key)) this.pausePressed = true;
    this.keys.add(key);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());
  private readonly onBlur = () => { this.keys.clear(); this.touch.clear(); };
  private readonly onVisibility = () => { if (document.hidden) this.onBlur(); };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setTouch(key: TouchKey, pressed: boolean) {
    if (pressed) this.touch.add(key);
    else this.touch.delete(key);
  }

  clear() { this.onBlur(); }

  consume(): InputSnapshot {
    const left = this.keys.has('arrowleft') || this.keys.has('a') || this.touch.has('left');
    const right = this.keys.has('arrowright') || this.keys.has('d') || this.touch.has('right');
    const accelerate = this.keys.has('arrowup') || this.keys.has('w') || this.touch.has('accelerate');
    const reverse = this.keys.has('arrowdown') || this.keys.has('s') || this.touch.has('reverse');
    const brake = this.keys.has('x') || this.touch.has('brake');
    const boost = this.keys.has('shift') || this.touch.has('boost');
    const snapshot = {
      steer: Number(right) - Number(left),
      accelerate,
      reverse,
      brake,
      horn: this.hornPressed,
      boost,
      pause: this.pausePressed,
    };
    this.hornPressed = false;
    this.pausePressed = false;
    return snapshot;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.onBlur();
  }
}
