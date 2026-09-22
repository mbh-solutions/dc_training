/** Disposable S06 hosted canary for supported TypeScript accessors. */
export class CanaryReading {
  private currentValue: number;

  constructor(value: number) {
    this.currentValue = value;
  }

  get value(): number {
    return this.currentValue;
  }

  set value(value: number) {
    this.currentValue = value;
  }
}
