/** Disposable S06 hosted ambiguity canary. NEVER MERGE. */
export class AmbiguousCanary {
  duplicate(value: number): number {
    return value;
  }

  duplicate(value: number): number {
    return value + 1;
  }
}
