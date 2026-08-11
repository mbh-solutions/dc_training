export type WeightEntry = {
  amount: string;
  micrograms?: string;
  unit: "kg" | "lb";
};

export type WeightUnit = WeightEntry["unit"];

export function displayWeight(entry: WeightEntry, unit: WeightUnit) {
  if (entry.unit === unit) return { ...entry, converted: false };
  const micrograms = entry.micrograms
    ? BigInt(entry.micrograms)
    : weightMicrograms(entry);
  if (micrograms === null) return { ...entry, converted: false };
  return {
    amount: amountForUnit(micrograms, unit),
    converted: true,
    micrograms: micrograms.toString(),
    unit,
  };
}

export function conversionPreview(entry: WeightEntry) {
  const micrograms = weightMicrograms(entry);
  if (micrograms === null) return "";
  const targetUnit = entry.unit === "lb" ? "kg" : "lb";
  return `≈ ${amountForUnit(micrograms, targetUnit)} ${targetUnit}`;
}

function amountForUnit(micrograms: bigint, unit: WeightUnit) {
  const stepMicrograms = unit === "kg" ? 250000000n : 226796185n;
  const steps = (micrograms + stepMicrograms / 2n) / stepMicrograms;
  const divisor = unit === "kg" ? 4n : 2n;
  const whole = steps / divisor;
  const remainder = steps % divisor;
  const fraction =
    unit === "kg"
      ? ["", ".25", ".5", ".75"][Number(remainder)]
      : remainder === 0n
        ? ""
        : ".5";
  return `${whole}${fraction}`;
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
