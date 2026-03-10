import type {
  BuildingDefId,
  CityTier as ContentCityTier,
  DomainTag,
  DifficultyId,
  EventChainId,
  FactionAgenda,
  FactionId,
  FactionProfile,
  LegendaryConsultationId,
  NamedCharacterArchetypeId,
  NamedCharacterCadence as ContentNamedCharacterCadence,
  NamedCharacterRole as ContentNamedCharacterRole,
  OriginId,
  PhilosopherId,
  PhilosopherThreatStage as ContentPhilosopherThreatStage,
  PriestRole as ContentPriestRole,
  PythiaArchetypeId,
  PythiaTraitId,
  ReputationTierId,
  RivalOracleId,
  RivalOracleOperationId,
  ResourceId,
  ScenarioId,
  TechId,
  TileSemantics,
  WalkerTraitId
} from "@the-oracle/content";

export type {
  BuildingDefId,
  DomainTag,
  DifficultyId,
  EventChainId,
  FactionAgenda,
  FactionId,
  FactionProfile,
  LegendaryConsultationId,
  NamedCharacterArchetypeId,
  OriginId,
  PhilosopherId,
  PythiaArchetypeId,
  PythiaTraitId,
  ReputationTierId,
  RivalOracleId,
  RivalOracleOperationId,
  ResourceId,
  ScenarioId,
  TechId,
  TileSemantics,
  WalkerTraitId
};
export type { BurdenId } from "./lineage";
import type { TerrainDepositType } from "@the-oracle/content";
import type { TerrainType } from "../terrain/generate";
import type { AgeState } from "./ages";
import type { EspionageState } from "./espionage";
import type { ExcavationState } from "./excavation";
import type { LegacyState } from "./legacy";
import type { LineageState, BurdenId } from "./lineage";
import type { ProphecyArcState } from "./prophecy";
import type { WorldGenerationState } from "./worldGen";
import type { WorldHistoryState } from "./worldHistory";

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

export type PriestRole = ContentPriestRole;
export type PhilosopherThreatStage = ContentPhilosopherThreatStage;
export type NamedCharacterRole = ContentNamedCharacterRole;
export type NamedCharacterCadence = ContentNamedCharacterCadence;

export type WalkerRole = "priest" | "pilgrim" | "custodian" | "carrier";

export type SemanticTarget =
  | "army"
  | "fleet"
  | "king"
  | "city"
  | "oracle"
  | "harvest"
  | "treasury"
  | "alliance";

export type SemanticAction =
  | "triumph"
  | "fall"
  | "fracture"
  | "endure"
  | "prosper"
  | "withhold";

export type SemanticPolarity = "favorable" | "warning" | "double";

export type AmbiguityBand = "cryptic" | "balanced" | "specific";

export type TimeHorizon = "immediate" | "seasonal" | "yearly";

export type Coord = {
  x: number;
  y: number;
};

export type TerrainDeposit = {
  type: TerrainDepositType;
  currentYield: number;
  maxYield: number;
  regenPerDay: number;
  depletedDay?: number;
  regrowthStage?: number;
};

export type ProductionPhase = "idle" | "walking_to_deposit" | "gathering" | "returning" | "processing" | "storing";

export type PlacementTool = "select" | BuildingDefId;

export type WorldClock = {
  tick: number;
  day: number;
  month: number;
  year: number;
  season: Season;
  tickOfDay: number;
  ticksPerDay: number;
  speed: 0 | 1 | 2 | 3;
  paused: boolean;
};

export type ResourceState = {
  amount: number;
  capacity: number;
  trend: number;
};

export type BuildingInstance = {
  id: string;
  defId: BuildingDefId;
  position: Coord;
  condition: number;
  maxCondition: number;
  requiresPriest: boolean;
  assignedPriestIds: string[];
  assignedWorkerIds: string[];
  storedResources: Partial<Record<ResourceId, number>>;
  connectedToRoad: boolean;
  /** Construction progress (0 to constructionWork). Undefined or equal to constructionWork = complete. */
  constructionProgress?: number;
  /** Total work units needed to finish. Undefined or 0 = already complete. */
  constructionWork?: number;
};

/** Returns true if the building is still under construction. */
export function isBuildingUnderConstruction(building: BuildingInstance): boolean {
  return (building.constructionWork ?? 0) > 0
    && (building.constructionProgress ?? 0) < building.constructionWork!;
}

export type WalkerState = "idle" | "moving" | "working" | "repairing" | "visiting" | "hauling" | "delivering";

export type WalkerInstance = {
  id: string;
  role: WalkerRole;
  name: string;
  tile: Coord;
  state: WalkerState;
  homeBuildingId?: string;
  assignmentBuildingId?: string;
  path: Coord[];
  moveCooldown: number;
  destination?: Coord;
  carrying?: ResourceId;
  carryingAmount?: number;
  assignedJobId?: string;
  fatigue?: number;
  haulingSkill?: number;
  supplyRadius?: number;
  productionPhase?: ProductionPhase;
  gatherTargetTile?: Coord;
  phaseProgress?: number;
  phaseWork?: number;
  gatherResourceId?: ResourceId;
  gatherAmount?: number;
  hungerTicks?: number;
  traits?: WalkerTraitId[];
  experience?: number;
  skillLevel?: number;
  morale?: number;
};

export type PriestSecretKind = "corruption" | "heresy" | "rivalry" | "forbidden_knowledge";

export type PriestSecret = {
  id: string;
  kind: PriestSecretKind;
  severity: number;
  discoveredDay?: number;
  exposedDay?: number;
};

export type PriestPersonality = "devout" | "ambitious" | "scholarly" | "political" | "mystical";

export type PriestRelationship = {
  targetPriestId: string;
  sentiment: "friendly" | "neutral" | "rival";
  strength: number; // 0-100
};

export type PriestState = {
  id: string;
  walkerId: string;
  role: PriestRole;
  skill: number;
  morale: number;
  range: number;
  currentAssignmentBuildingId?: string;
  homeBuildingId?: string;
  secrets?: PriestSecret[];
  successionRank?: number;
  experience?: number; // 0-100, grows with assignments
  personality?: PriestPersonality;
  relationships?: Record<string, PriestRelationship>;
  loyalty?: number; // 0-100, to the oracle
  grievances?: string[];
};

export type PriestTemperament = "steady" | "zealous" | "cunning" | "scholarly";

export type PriestAmbition = "guardian" | "broker" | "reformer" | "mystic";

export type PriestPoliticalStance = "loyalist" | "traditionalist" | "broker" | "reformer";

export type PriestCouncilBlocId = "pythia" | "rites" | "patrons" | "reformers";

export type PriestPoliticalProfile = {
  priestId: string;
  temperament: PriestTemperament;
  ambition: PriestAmbition;
  stance: PriestPoliticalStance;
  influence: number;
  loyalty: number;
  dissent: number;
  favoredFactionId?: FactionId;
  anchorCharacterId?: string;
  note: string;
};

export type PriestCouncilBlocState = {
  id: PriestCouncilBlocId;
  label: string;
  support: number;
  tension: number;
  note: string;
};

export type PriestPoliticsStatus = "calm" | "restless" | "fractured" | "crisis";

export type SuccessionContest = {
  active: boolean;
  candidates: string[];
  frontRunnerId?: string;
  startDay: number;
};

export type PriestPoliticsState = {
  overallPressure: number;
  unity: number;
  dominantBlocId: PriestCouncilBlocId;
  status: PriestPoliticsStatus;
  currentIssue: string;
  rumor: string;
  featuredCharacterIds: string[];
  lastUpdatedDay: number;
  blocs: PriestCouncilBlocState[];
  priests: Record<string, PriestPoliticalProfile>;
  successionContest?: SuccessionContest;
};

export type PythiaState = {
  name: string;
  attunement: number;
  physicalHealth: number;
  mentalClarity: number;
  tranceDepth: number;
  prestige: number;
  needs: {
    purification: number;
    rest: number;
    pilgrimageCooldown: number;
    food: number;
  };
  traits: PythiaTraitId[];
};

export type FactionTrustState = "neutral" | "distrust" | "devotion";

export type FactionMemory = {
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  trustState: FactionTrustState;
};

export type FactionState = {
  id: FactionId;
  name: string;
  profile: FactionProfile;
  favoredResource: Exclude<ResourceId, "gold">;
  relations: Partial<Record<FactionId, number>>;
  treaties: FactionId[];
  embargoes: FactionId[];
  credibility: number;
  favour: number;
  dependence: number;
  debt: number;
  currentAgenda: FactionAgenda;
  activeConflicts: FactionId[];
  tradeAccess: boolean;
  lastOutcome?: string;
  history: string[];
  memory?: FactionMemory;
};

export type PhilosopherThreatLevel = "dormant" | PhilosopherThreatStage;

export type PhilosopherThreatState = {
  philosopherId: PhilosopherId;
  worldview: string;
  influence: number;
  suspicion: number;
  pressure: number;
  stage: PhilosopherThreatLevel;
  active: boolean;
  lastShiftMonth?: number;
  lastEventDay?: number;
};

export type PhilosophersState = {
  byFaction: Record<FactionId, PhilosopherThreatState>;
  spotlightFactionIds: FactionId[];
};

export type RivalOracleDiscovery = "shadow" | "suspected" | "confirmed";

export type RivalOracleOperationState = {
  id: RivalOracleOperationId;
  successCount: number;
  lastExecutedDay?: number;
};

export type RivalOracleIncident = {
  id: string;
  day: number;
  rivalId: RivalOracleId;
  operationId: RivalOracleOperationId;
  targetRegionId: string;
  targetFactionId?: FactionId;
  discovery: RivalOracleDiscovery;
  pressureDelta: number;
  visibility: number;
  intel: number;
  summary: string;
};

export type RivalStrategy = "aggressive" | "subversive" | "diplomatic";

export type RivalOracleState = {
  id: RivalOracleId;
  name: string;
  title: string;
  homeRegionId: string;
  favoredDomain: DomainTag;
  active: boolean;
  patronFactionId: FactionId;
  patronage: number;
  pressure: number;
  visibility: number;
  intel: number;
  intrigue: number;
  pressureCap: number;
  lastOperationDay?: number;
  lastKnownOperationId?: RivalOracleOperationId;
  lastTargetRegionId?: string;
  operations: RivalOracleOperationState[];
  strategy?: RivalStrategy;
  currentOperationNarrative?: string;
  weaknessKnown?: boolean;
  vulnerabilityDomain?: DomainTag;
};

export type RivalOraclesState = {
  roster: RivalOracleState[];
  spotlightRivalIds: RivalOracleId[];
  incidents: RivalOracleIncident[];
  totalPressure: number;
  lastPressureDay?: number;
};

export type CharacterRelationshipState = {
  trust: number;
  fear: number;
  hostility: number;
  familiarity: number;
};

export type CharacterMemoryState = {
  knownSinceDay: number;
  visitCount: number;
  successfulVisits: number;
  rebuffedVisits: number;
  lastSeenDay?: number;
  lastInteractionDay?: number;
  lastLocationId?: string;
  lastImpression?: string;
  notableMoments: string[];
};

export type NamedCharacterStatus = "active" | "dormant" | "legendary";

export type CharacterArc = {
  arcId: string;
  stage: number; // 0-based, which visit we're on
  totalStages: number;
  narrative: string;
  resolved: boolean;
};

export type NamedCharacterState = {
  id: string;
  defId: NamedCharacterArchetypeId;
  role: NamedCharacterRole;
  cadence: NamedCharacterCadence;
  name: string;
  title: string;
  epithet: string;
  displayName: string;
  homeFactionId?: FactionId;
  anchorRegionId?: string;
  influence: number;
  prominence: number;
  status: NamedCharacterStatus;
  tags: string[];
  relationship: CharacterRelationshipState;
  memory: CharacterMemoryState;
  currentArc?: CharacterArc;
};

export type CharactersState = {
  roster: NamedCharacterState[];
  spotlightCharacterIds: string[];
};

export type OmenReport = {
  id: string;
  sourceRole: string;
  text: string;
  semantics: TileSemantics;
  reliability: number;
};

export type WordTile = {
  id: string;
  text: string;
  category: "subject" | "action" | "condition" | "modifier" | "seal";
  semantics: TileSemantics;
};

export type ProphecyDepthBand = "shallow" | "grounded" | "deep" | "oracular";

export type ProphecyScaffoldPart = {
  kind: "spine" | "hinge" | "seal";
  label: string;
  text: string;
  tileIds: string[];
  state: "missing" | "forming" | "stable" | "charged";
};

export type ProphecyInterpretation = {
  summary: string;
  politicalReading: string;
  caution: string;
  fulfillmentWindow: string;
  rivalContext?: string | null;
};

export type ProphecyReinterpretationSpin = "supportive" | "hostile" | "exploitative" | "dismissive";

export type ProphecyReinterpretation = {
  id: string;
  prophecyId: string;
  factionId: FactionId;
  originalFactionId: FactionId;
  spin: ProphecyReinterpretationSpin;
  narrative: string;
  credibilityImpact: number;
  behaviorShift?: FactionAgenda;
  dayCreated: number;
};

export type ProphecyRecord = {
  id: string;
  factionId: FactionId;
  dayIssued: number;
  text: string;
  tileIds: string[];
  semantics: TileSemantics[];
  clarity: number;
  value: number;
  risk: number;
  depth?: number;
  depthBand?: ProphecyDepthBand;
  omenReliability?: number;
  omenConsensus?: "aligned" | "mixed" | "contradictory";
  scaffold?: ProphecyScaffoldPart[];
  interpretation?: ProphecyInterpretation;
  dueDay: number;
  resolved: boolean;
  resolvedDay?: number;
  resolutionReport?: string;
  credibilityDelta?: number;
  beliefStrength?: number;
  reinterpretations?: ProphecyReinterpretation[];
};

export type ConsequenceCase = {
  id: string;
  prophecyId: string;
  factionId: FactionId;
  dueDay: number;
  outcome: TileSemantics;
  resolved: boolean;
  report?: string;
  credibilityDelta?: number;
};

export type ConsultationCurrent = {
  id: string;
  factionId: FactionId;
  envoyName: string;
  mood: string;
  paymentOffered: number;
  question: string;
  domain: DomainTag;
  omenReports: OmenReport[];
  tilePool: WordTile[];
  placedTileIds: string[];
  scorePreview: {
    clarity: number;
    value: number;
    risk: number;
    depth?: number;
    depthBand?: ProphecyDepthBand;
  };
};

export type ConsultationState = {
  mode: "idle" | "pending" | "open";
  current?: ConsultationCurrent;
  history: ProphecyRecord[];
};

export type AdvisorMessage = {
  id: string;
  advisorId: string;
  text: string;
  severity: "info" | "warn" | "critical";
};

export type EventFeedItem = {
  id: string;
  day: number;
  text: string;
};

export type TradeOffer = {
  id: string;
  factionId: FactionId;
  resourceId: ResourceId;
  amount: number;
  price: number;
};

export type ResourceTransferJob = {
  id: string;
  resourceId: Exclude<ResourceId, "gold">;
  amount: number;
  sourceBuildingId: string;
  targetBuildingId: string;
  priority: "critical" | "high" | "routine";
  assignedWalkerId?: string;
  phase: "to_source" | "to_target";
};

export type ReputationState = {
  score: number;
  currentTier: ReputationTierId;
  nextTier?: ReputationTierId;
  thresholds: Record<ReputationTierId, number>;
  unlockedBuildingIds: BuildingDefId[];
  unlockedScenarioIds: ScenarioId[];
  lastTierChangeDay?: number;
};

export type TreasuryDedicationState = {
  completed: number;
  totalGoldInvested: number;
  nextMilestoneGold: number;
  lastDedicationDay?: number;
};

export type WorldNodeTag = "sanctuary" | "city" | "port" | "pass";

export type WorldMapNode = {
  id: string;
  label: string;
  position: Coord;
  controllingFactionId?: FactionId;
  tags: WorldNodeTag[];
  pressure: number;
  unrest: number;
  connectedNodeIds: string[];
};

export type WorldMapLink = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: "road" | "sea" | "mountain";
  tradeFlow: number;
  risk: number;
};

export type CampaignPressureIndicator = {
  id: string;
  factionId: FactionId;
  nodeId: string;
  kind: "consultation" | "trade" | "conflict";
  severity: "low" | "rising" | "critical";
  value: number;
};

export type CrisisChainState = {
  id: string;
  label: string;
  nodeId: string;
  factionId?: FactionId;
  stage: "rumor" | "active" | "resolution";
  pressure: number;
  stepsCompleted: number;
  resolvedDay?: number;
};

export type ProgressionMilestones = {
  buildingMilestones: number[];
  factionTrustMilestones: string[];
  ageMilestones: string[];
};

export type CampaignState = {
  scenarioId: ScenarioId;
  reputation: ReputationState;
  treasury: TreasuryDedicationState;
  patronMilestones: string[];
  worldMap: {
    selectedNodeId?: string;
    nodes: WorldMapNode[];
    links: WorldMapLink[];
    activePressures: CampaignPressureIndicator[];
    crisisChains: CrisisChainState[];
  };
  winCondition: {
    id: string;
    label: string;
    completed: boolean;
    summary?: string;
    completedDay?: number;
  };
  grandConsultationActive?: boolean;
  sacredPilgrimage?: {
    priestId: string;
    returnDay: number;
  };
  milestones?: ProgressionMilestones;
};

export type LegendaryConsultationProgress = {
  consultationId: LegendaryConsultationId;
  currentStage: number;
  startDay: number;
  completed: boolean;
  completedDay?: number;
};

export type ResearchState = {
  knowledgeAccumulated: number;
  activeTechId?: TechId;
  activeTechProgress: number;
  completedTechIds: TechId[];
};

export type ActiveEventChain = {
  id: string;
  defId: EventChainId;
  currentStageId: string;
  startDay: number;
  stageStartDay: number;
  factionId?: FactionId;
  pendingChoice?: boolean;
  choiceMade?: "a" | "b";
  resolved: boolean;
  resolvedDay?: number;
};

export type TreatyKind = "trade_access" | "mutual_defense" | "consultation_priority";

export type Treaty = {
  id: string;
  factionId: FactionId;
  kind: TreatyKind;
  goldPerMonth: number;
  startDay: number;
  active: boolean;
  obligationsMet: boolean;
};

export type FactionDemandType = "tribute" | "exclusive_consultation" | "favorable_reading" | "resource_access";

export type FactionDemand = {
  id: string;
  factionId: FactionId;
  demandType: FactionDemandType;
  description: string;
  goldAmount?: number;
  dayIssued: number;
  expiresDay: number;
  resolved: boolean;
};

export type MarketState = {
  priceIndex: Partial<Record<ResourceId, number>>;
  supplyPressure: Partial<Record<ResourceId, number>>;
  demandPressure: Partial<Record<ResourceId, number>>;
  lastUpdateMonth: number;
};

export type PatronContract = {
  id: string;
  factionId: FactionId;
  characterId?: string;
  goldPerMonth: number;
  demandedDomain: DomainTag;
  demandedPolarity: "favorable" | "any";
  satisfactionScore: number;
  startDay: number;
  durationMonths: number;
  active: boolean;
};

export type Loan = {
  id: string;
  factionId: FactionId;
  principalGold: number;
  interestRate: number;
  remainingPayments: number;
  monthlyPayment: number;
  startDay: number;
  missedPayments: number;
};

export type ActiveFestival = {
  defId: string;
  startDay: number;
  endDay: number;
  resourcesMet: boolean;
  resolved: boolean;
};

export type AchievementProgress = {
  unlockedIds: string[];
  stats: {
    propheciesDelivered: number;
    yearsCompleted: number;
    festivalsSucceeded: number;
    espionageSuccesses: number;
    espionageDetections: number;
    treatiesFormed: number;
    warsStayedNeutral: number;
    highestBeliefStrength: number;
    totalPatrons: number;
    hadDebt: boolean;
  };
};

export type WeatherCondition = "normal" | "drought" | "flood" | "harsh_winter" | "heat_wave";

export type GameEvent =
  | { type: "DayAdvanced"; day: number }
  | { type: "TechResearched"; techId: TechId }
  | { type: "BuildingPlaced"; buildingId: string; defId: BuildingDefId }
  | { type: "ConstructionComplete"; buildingId: string; defId: BuildingDefId }
  | { type: "WalkerAssigned"; walkerId: string; buildingId: string }
  | { type: "ResourceConsumed"; resourceId: ResourceId; amount: number }
  | { type: "BuildingDegraded"; buildingId: string; condition: number }
  | { type: "ConsultationStarted"; consultationId: string; factionId: FactionId }
  | { type: "ProphecyDelivered"; prophecyId: string; factionId: FactionId }
  | { type: "CredibilityChanged"; factionId: FactionId; delta: number }
  | { type: "ConsequenceResolved"; consequenceId: string; factionId: FactionId; delta: number }
  | { type: "RivalOracleOperation"; rivalId: RivalOracleId; operationId: RivalOracleOperationId; day: number }
  | { type: "TradePurchased"; offerId: string; resourceId: ResourceId; amount: number }
  | { type: "AutosaveTriggered"; day: number }
  | { type: "EventChainAdvanced"; chainId: string; stageId: string }
  | { type: "EventChainCompleted"; chainId: string; defId: EventChainId }
  | { type: "DepositDepleted"; tileKey: string; depositType: TerrainDepositType }
  | { type: "ResourceProduced"; resourceId: ResourceId; amount: number; buildingId: string }
  | { type: "ResourceSold"; resourceId: ResourceId; amount: number; goldEarned: number; factionId: FactionId }
  | { type: "BuildingDemolished"; buildingId: string; defId: BuildingDefId; goldReturned: number }
  | { type: "TradeOfferGenerated"; offerId: string; factionId: FactionId; resourceId: ResourceId };

export type GameSnapshot = {
  version: 1 | 2;
  state: GameState;
  recentEvents: GameEvent[];
};

export type RunConfig = {
  scenarioId: ScenarioId;
  difficultyId: DifficultyId;
  pythiaArchetypeId: PythiaArchetypeId;
  startingRegionId: string;
};

export type CityTier = ContentCityTier;

export type CityProsperity = {
  prosperityScore: number;      // 0-100, derived monthly
  pilgrimAttraction: number;    // 0-100, drives visitor flow
  tradeRevenue: number;         // gold/month from trade_income buildings
  donationRevenue: number;      // gold/month from donation buildings
  visitorCount: number;         // current visitors in city
  visitorCapacity: number;      // from pilgrim_capacity passive effects
  growthRate: number;           // population growth modifier
  cityTier: CityTier;
};

export type OracleImpactEvent =
  | { kind: "prophecy_success_streak" }
  | { kind: "prophecy_failure_streak" }
  | { kind: "reputation_tier_up" }
  | { kind: "reputation_tier_down" }
  | { kind: "crisis_resolved" }
  | { kind: "crisis_escalated" }
  | { kind: "festival_success" }
  | { kind: "festival_failure" };

export type GameState = {
  worldSeed: number;
  worldSeedText: string;
  originId: OriginId;
  runConfig: RunConfig;
  worldGeneration: WorldGenerationState;
  clock: WorldClock;
  grid: {
    width: number;
    height: number;
    roads: Coord[];
    terrainOverrides?: Record<string, TerrainType>;
    terrainDeposits?: Record<string, TerrainDeposit>;
  };
  resources: Record<ResourceId, ResourceState>;
  buildings: BuildingInstance[];
  walkers: WalkerInstance[];
  priests: PriestState[];
  priestPolitics?: PriestPoliticsState;
  pythia: PythiaState;
  factions: Record<FactionId, FactionState>;
  characters?: CharactersState;
  philosophers?: PhilosophersState;
  rivalOracles?: RivalOraclesState;
  age?: AgeState;
  espionage?: EspionageState;
  excavation?: ExcavationState;
  legacy?: LegacyState;
  prophecyArcs?: ProphecyArcState;
  worldHistory?: WorldHistoryState;
  lineage?: LineageState;
  research?: ResearchState;
  eventChains?: ActiveEventChain[];
  market?: MarketState;
  patrons?: PatronContract[];
  loans?: Loan[];
  treaties?: Treaty[];
  demands?: FactionDemand[];
  festivals?: ActiveFestival[];
  weather?: WeatherCondition;
  lastFestivalCheck?: number;
  endlessMode?: boolean;
  achievements?: AchievementProgress;
  cityProsperity?: CityProsperity;
  activeBurdens?: BurdenId[];
  legendaryProgress?: LegendaryConsultationProgress[];
  availableLegendary?: LegendaryConsultationId[];
  consultation: ConsultationState;
  consequences: ConsequenceCase[];
  advisorMessages: AdvisorMessage[];
  eventFeed: EventFeedItem[];
  tradeOffers: TradeOffer[];
  resourceJobs: ResourceTransferJob[];
  campaign: CampaignState;
  ui: {
    selectedEntityId?: string;
    selectedEntityKind?: "building" | "walker";
    activeTool: PlacementTool;
    hoveredTile?: Coord;
  };
  advisorHistory?: Record<string, string[]>;
  advisorAccuracy?: Record<string, { correct: number; total: number }>;
  lastAutosaveDay: number;
  nextId: number;
};
