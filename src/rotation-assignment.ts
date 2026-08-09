export const CHEST_EXERCISES = [
  "Incline barbell press",
  "Flat barbell press",
  "Decline barbell press",
  "Incline football-bar press",
  "Flat football-bar press",
  "Decline football-bar press",
  "Incline dumbbell press",
  "Flat dumbbell press",
  "Decline dumbbell press",
] as const;

export function formatTargetRange(min: number | null, max: number | null) {
  return min && max ? `${min}–${max}` : "NOT APPLICABLE";
}
