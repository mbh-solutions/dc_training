import type { S05ApplicationCanary } from "../application/s05-canary.js";
export interface S05DomainCanary {
  readonly value: string;
  readonly application?: S05ApplicationCanary;
}
