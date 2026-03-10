import type { EventStageOutcome, ResourceId, ReputationTierId } from "./schema";

export type FestivalDef = {
  id: string;
  name: string;
  description: string;
  month: number; // 1-12
  durationDays: number;
  frequency: "annual" | "quadrennial";
  resourceDemands: Partial<Record<ResourceId, number>>;
  successRewards: EventStageOutcome[];
  failurePenalties: EventStageOutcome[];
  minimumTier?: ReputationTierId;
};

export const festivalDefs: FestivalDef[] = [
  {
    id: "pythian-games",
    name: "Pythian Games",
    description: "The grand quadrennial athletic and musical competition honoring Apollo. The most prestigious festival at Delphi.",
    month: 8,
    durationDays: 10,
    frequency: "quadrennial",
    resourceDemands: { grain: 30, gold: 50, incense: 20 },
    successRewards: [
      { kind: "reputation_delta", delta: 8 },
      { kind: "pilgrim_surge", amount: 20 },
    ],
    failurePenalties: [
      { kind: "reputation_delta", delta: -5 },
    ],
    minimumTier: "recognized",
  },
  {
    id: "theoxenia",
    name: "Theoxenia",
    description: "A festival of sacred hospitality where the gods are invited to dine among mortals.",
    month: 3,
    durationDays: 5,
    frequency: "annual",
    resourceDemands: { bread: 15, olive_oil: 10 },
    successRewards: [
      { kind: "reputation_delta", delta: 3 },
      { kind: "pilgrim_surge", amount: 8 },
    ],
    failurePenalties: [
      { kind: "reputation_delta", delta: -2 },
    ],
  },
  {
    id: "stepteria",
    name: "Stepteria",
    description: "A purification ritual reenacting Apollo's slaying of the serpent Python.",
    month: 6,
    durationDays: 7,
    frequency: "annual",
    resourceDemands: { sacred_water: 20 },
    successRewards: [
      { kind: "reputation_delta", delta: 4 },
      { kind: "pilgrim_surge", amount: 10 },
    ],
    failurePenalties: [
      { kind: "reputation_delta", delta: -3 },
    ],
  },
  {
    id: "theophania",
    name: "Theophania",
    description: "The festival celebrating Apollo's divine appearance and return to Delphi.",
    month: 1,
    durationDays: 5,
    frequency: "annual",
    resourceDemands: { incense: 15, sacred_water: 10 },
    successRewards: [
      { kind: "reputation_delta", delta: 4 },
      { kind: "pilgrim_surge", amount: 8 },
    ],
    failurePenalties: [
      { kind: "reputation_delta", delta: -2 },
    ],
  },
  {
    id: "soteria",
    name: "Soteria",
    description: "A thanksgiving festival celebrating deliverance from danger, with offerings to Apollo.",
    month: 9,
    durationDays: 5,
    frequency: "annual",
    resourceDemands: { gold: 20 },
    successRewards: [
      { kind: "reputation_delta", delta: 3 },
      { kind: "pilgrim_surge", amount: 5 },
    ],
    failurePenalties: [
      { kind: "reputation_delta", delta: -2 },
    ],
  },
  {
    id: "heraia",
    name: "Heraia",
    description: "A women's festival honoring Hera with athletic contests and sacred offerings.",
    month: 5,
    durationDays: 5,
    frequency: "annual",
    resourceDemands: { olive_oil: 15, grain: 10 },
    successRewards: [
      { kind: "reputation_delta", delta: 3 },
      { kind: "pilgrim_surge", amount: 7 },
    ],
    failurePenalties: [
      { kind: "reputation_delta", delta: -2 },
    ],
  },
  {
    id: "daphnephoria",
    name: "Daphnephoria",
    description: "The quadrennial laurel procession honoring Apollo with sacred branches and gold offerings.",
    month: 4,
    durationDays: 7,
    frequency: "quadrennial",
    resourceDemands: { gold: 30, incense: 10 },
    successRewards: [
      { kind: "reputation_delta", delta: 6 },
      { kind: "pilgrim_surge", amount: 15 },
    ],
    failurePenalties: [
      { kind: "reputation_delta", delta: -4 },
    ],
    minimumTier: "recognized",
  },
  {
    id: "septeria",
    name: "Septeria",
    description: "A serpent ritual commemorating the primal struggle between Apollo and the chthonic forces.",
    month: 11,
    durationDays: 5,
    frequency: "annual",
    resourceDemands: { sacred_water: 15, incense: 10 },
    successRewards: [
      { kind: "reputation_delta", delta: 3 },
      { kind: "pilgrim_surge", amount: 6 },
    ],
    failurePenalties: [
      { kind: "reputation_delta", delta: -2 },
    ],
  },
];

export const festivalDefById = (id: string): FestivalDef | undefined =>
  festivalDefs.find((f) => f.id === id);
