export type WeightEntry = {
  amount: string;
  micrograms?: string;
  unit: "kg" | "lb";
};

export function conversionPreview(entry: WeightEntry) {
  const micrograms = weightMicrograms(entry);
  if (micrograms === null) return "";
  const targetUnit = entry.unit === "lb" ? "kg" : "lb";
  const stepMicrograms = targetUnit === "kg" ? 250000000n : 226796185n;
  const steps = (micrograms + stepMicrograms / 2n) / stepMicrograms;
  const divisor = targetUnit === "kg" ? 4n : 2n;
  const whole = steps / divisor;
  const remainder = steps % divisor;
  const fraction =
    targetUnit === "kg"
      ? ["", ".25", ".5", ".75"][Number(remainder)]
      : remainder === 0n
        ? ""
        : ".5";
  return `≈ ${whole}${fraction} ${targetUnit}`;
}

export function weightMicrograms(entry: WeightEntry) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(entry.amount);
  if (!match) return null;
  const cents =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  const centsPerStep = entry.unit === "lb" ? 50n : 25n;
  if (cents === 0n || cents % centsPerStep !== 0n) return null;
  const microgramsPerStep = entry.unit === "lb" ? 226796185n : 250000000n;
  return (cents / centsPerStep) * microgramsPerStep;
}
