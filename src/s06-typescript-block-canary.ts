/** Disposable S06 hosted BLOCK canary. NEVER MERGE. */
export class CanaryReading {
  private currentValue = 0;

  set value(value: number) {
    if (value === 1) value += 1;
    if (value === 2) value += 1;
    if (value === 3) value += 1;
    if (value === 4) value += 1;
    if (value === 5) value += 1;
    if (value === 6) value += 1;
    if (value === 7) value += 1;
    if (value === 8) value += 1;
    if (value === 9) value += 1;
    if (value === 10) value += 1;
    this.currentValue = value;
  }
}
