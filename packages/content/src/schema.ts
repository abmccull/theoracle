export type ResourceId =
  | "gold"
  | "sacred_water"
  | "olive_oil"
  | "incense"
  | "grain"
  | "sacred_animals"
  | "bread"
  | "olives"
  | "papyrus"
  | "scrolls"
  | "logs"
  | "stone"
  | "planks"
  | "cut_stone"
  | "knowledge";

export type BuildingDefId =
  | "sacred_way"
  | "priest_quarters"
  | "storehouse"
  | "castalian_spring"
  | "inner_sanctum"
  | "eternal_flame_brazier"
  | "sacrificial_altar"
  | "animal_pen"
  | "granary"
  | "kitchen"
  | "olive_press"
  | "incense_store"
  | "agora_market"
  | "xenon"
  | "grain_field"
  | "olive_grove"
  | "incense_workshop"
  | "papyrus_reed_bed"
  | "scriptorium"
  | "library"
  | "hylotomos_camp"
  | "lithotomia"
  | "tekton_ergasterion"
  | "lithoxoos"
  | "ergasterion"
  | "apotheke"
  | "treasury_of_nations"
  | "stoa_of_columns"
  | "sacred_theater";

export type PriestRole =
  | "attendant"
  | "spring_warden"
  | "flame_keeper"
  | "augur"
  | "sacrificial_priest"
  | "dream_priest"
  | "astronomer"
  | "scholar";

export type FactionId =
  | "athens"
  | "sparta"
  | "corinth"
  | "thebes"
  | "argos"
  | "miletus"
  | "syracuse"
  | "macedon";

export type FactionAgenda = "war" | "trade" | "faith" | "succession";

export type DomainTag = "military" | "economic" | "spiritual";

export type FactionProfile = "martial" | "mercantile" | "devout" | "scheming";

export type PhilosopherId = "anaxagoras" | "democritus" | "gorgias" | "heraclitus" | "pythagoras";

export type PhilosopherSchool = "court-naturalist" | "atomist" | "sophist" | "strife-doctrine" | "mystic-order";

export type PhilosopherThreatStage = "rumor" | "circle" | "sect" | "crisis";

export type RivalOracleId = "oak-seers" | "isthmus-ledger" | "wolf-cup" | "mist-sibyls";

export type RivalOracleOperationId = "poach-supplicants" | "plant-whispers" | "court-patron" | "counter-rite";

export type RivalOracleOperationKind = "pressure" | "espionage" | "patronage";

export type NamedCharacterRole = "merchant" | "general" | "envoy" | "philosopher" | "priest" | "legendary";

export type NamedCharacterArchetypeId =
  | "merchant-patron"
  | "campaign-general"
  | "faction-envoy"
  | "wandering-philosopher"
  | "delphic-priest"
  | "legendary-visitor";

export type NamedCharacterCadence = "seasonal" | "campaign" | "diplomatic" | "wandering" | "ritual" | "legendary";

export type PhilosopherEffectVector = {
  credibility: number;
  favour: number;
  debt: number;
  dependence: number;
};

export type PhilosopherPressureBias = {
  debt: number;
  dependence: number;
  lowCredibility: number;
  conflicts: number;
  embargoes: number;
  agendaAlignment: number;
  worldviewAlignment: number;
};

export type WalkerTraitId =
  | "industrious"
  | "devout"
  | "shrewd"
  | "hardy"
  | "swift"
  | "skilled_builder"
  | "careful"
  | "charismatic";

export type PythiaTraitId = "visionary" | "calculating" | "diplomatic" | "fragile";

export type DifficultyId = "pilgrim" | "oracle" | "prophet" | "mythic";

export type PythiaArchetypeId =
  | "hearth-voice"
  | "silver-tongue"
  | "storm-sighted"
  | "keeper-of-tablets";

export type ScenarioId =
  | "rising-oracle"
  | "sandbox"
  | "young-oracle"
  | "crossroads-of-power"
  | "skeptics-challenge"
  | "golden-age"
  | "twilight-of-the-gods"
  | "spys-web"
  | "sacred-excavation";

export type OriginId =
  | "ancient-spring"
  | "upstart-shrine"
  | "cursed-oracle"
  | "war-oracle"
  | "gods-favourite"
  | "merchant-oracle"
  | "exiles-oracle";

export type ReputationTierId = "obscure" | "recognized" | "revered" | "panhellenic";

export type CityTier = "village" | "town" | "city" | "panhellenic_center";

export type TerrainDepositType = "timber" | "stone" | "fertile_soil" | "sacred_spring";

export type TerrainDepositDef = {
  type: TerrainDepositType;
  maxYield: number;
  regenPerDay: number;
  regenCycleDays: number;
  sourceTerrain: string;
};

export type ProductionCycleDef = {
  gatherTicks: number;
  gatherYield: number;
  processTicks: number;
  depositType: TerrainDepositType;
};

export type BuildingCategory = "processional" | "housing" | "storage" | "ritual" | "production" | "trade" | "hospitality";

export type TileSemantics = {
  target: "army" | "fleet" | "king" | "city" | "oracle" | "harvest" | "treasury" | "alliance";
  action: "triumph" | "fall" | "fracture" | "endure" | "prosper" | "withhold";
  polarity: "favorable" | "warning" | "double";
  ambiguity: "cryptic" | "balanced" | "specific";
  timeHorizon: "immediate" | "seasonal" | "yearly";
  domain: DomainTag;
};

export type BuildingRecipe = {
  id: string;
  consumes: Partial<Record<ResourceId, number>>;
  produces: Partial<Record<ResourceId, number>>;
  dailyRate: number;
  requiresRoles?: PriestRole[];
  notes?: string;
};

export type BuildingPassiveEffect = {
  id: string;
  kind: "prestige" | "donation" | "omen_quality" | "trade_income" | "pilgrim_capacity" | "storage_buffer" | "carrier_range";
  value: number;
  resourceId?: ResourceId;
  notes?: string;
};

export type BuildingStaffing = {
  priests?: Partial<Record<PriestRole, number>>;
  custodians?: number;
  carriers?: number;
  visitors?: number;
};

export type HousingCapacity = {
  priests?: number;
  carriers?: number;
  custodians?: number;
};

export type AdjacencyBonus = {
  nearDefId: BuildingDefId;
  bonusKind: "production" | "storage" | "condition";
  value: number; // Multiplier: 0.15 = +15%
  maxDistance: number; // In tiles (Manhattan distance)
};

export type BuildingDef = {
  id: BuildingDefId;
  name: string;
  description: string;
  category: BuildingCategory;
  costGold: number;
  /** Material resources required for construction (deducted on placement). */
  costResources?: Partial<Record<ResourceId, number>>;
  /** Total construction work units. 0 or undefined = instant build. */
  constructionWork?: number;
  requiresPriest: boolean;
  maxCondition: number;
  color: number;
  unlockTier?: ReputationTierId;
  /** Tech required to build. If set, player must have researched this tech. */
  requiredTech?: TechId;
  /** Minimum city tier required to construct this building. */
  cityTierRequirement?: CityTier;
  upkeep: Partial<Record<ResourceId, number>>;
  startingResources: Partial<Record<ResourceId, number>>;
  staffing?: BuildingStaffing;
  storageCaps?: Partial<Record<ResourceId, number>>;
  recipes?: BuildingRecipe[];
  passiveEffects?: BuildingPassiveEffect[];
  housingCapacity?: HousingCapacity;
  adjacencyBonuses?: AdjacencyBonus[];
  requiredNearbyTerrain?: {
    terrainTypes: string[];
    depositType: TerrainDepositType;
    maxDistance: number;
  };
  productionCycle?: ProductionCycleDef;
  spoilageReduction?: Partial<Record<ResourceId, number>>;
};

export type SeasonName = "Spring" | "Summer" | "Autumn" | "Winter";

export type SpoilageConfig = {
  baseRatePerDay: number;
  summerMultiplier: number;
  lowConditionMultiplier: number;
};

export type ResourceDef = {
  id: ResourceId;
  label: string;
  category: "currency" | "ritual" | "food" | "trade" | "material" | "research";
  seasonalMultipliers?: Partial<Record<SeasonName, number>>;
  spoilage?: SpoilageConfig;
};

export type OmenDef = {
  id: string;
  priestRole: string;
  family?: DomainTag | "ritual";
  templates: string[];
};

export type WordTileDef = {
  id: string;
  text: string;
  category: "subject" | "action" | "condition" | "modifier" | "seal";
  semantics: TileSemantics;
};

export type FactionDef = {
  id: FactionId;
  name: string;
  defaultAgenda: FactionAgenda;
  tradeAccess: boolean;
  profile: FactionProfile;
  favoredResource: Exclude<ResourceId, "gold">;
};

export type TraitDef = {
  id: PythiaTraitId;
  label: string;
  description: string;
};

export type RunDifficultyDef = {
  id: DifficultyId;
  label: string;
  title?: string;
  summary: string;
  worldBias?: {
    climate?: number;
    economy?: number;
    divineMood?: number;
    oracleDensity?: number;
    pressure?: number;
    unrest?: number;
  };
  startingResources?: Partial<Record<ResourceId, number>>;
  pythiaModifiers?: {
    attunement?: number;
    physicalHealth?: number;
    mentalClarity?: number;
    tranceDepth?: number;
    prestige?: number;
    purification?: number;
    rest?: number;
  };
  factionModifiers?: {
    credibility?: number;
    favour?: number;
    dependence?: number;
    debt?: number;
  };
};

export type PythiaArchetypeDef = {
  id: PythiaArchetypeId;
  label: string;
  title?: string;
  summary: string;
  name: string;
  startingTraits?: PythiaTraitId[];
  pythiaModifiers?: {
    attunement?: number;
    physicalHealth?: number;
    mentalClarity?: number;
    tranceDepth?: number;
    prestige?: number;
    purification?: number;
    rest?: number;
  };
  startingResources?: Partial<Record<ResourceId, number>>;
};

export type AdvisorDef = {
  id: string;
  name: string;
  voice: string;
};

export type ScenarioStartConditions = {
  gold?: number;
  reputation?: string;
  factionMod?: Record<string, Partial<{ credibility: number; favour: number; hostility: number }>>;
  burdens?: string[];
  startAge?: string;
};

export type ScenarioDef = {
  id: ScenarioId;
  label: string;
  summary: string;
  description?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  startingConditions?: ScenarioStartConditions;
  specialRules?: string[];
  victoryCondition?: string;
  recommendedStartingTier?: ReputationTierId;
  dedicationMilestones?: number[];
  requiredResolvedCrises?: number;
  winningTier?: ReputationTierId;
};

export type OriginDef = {
  id: OriginId;
  label: string;
  title?: string;
  subtitle?: string;
  summary: string;
  advisorIntro: string;
  uniqueMechanic: string;
  disabledSystems?: string[];
  challengeTags?: string[];
  scoreModifier?: number;
  startingResources?: Partial<Record<ResourceId, number>>;
  pythiaModifiers?: {
    attunement?: number;
    physicalHealth?: number;
    mentalClarity?: number;
    tranceDepth?: number;
    prestige?: number;
    rest?: number;
    purification?: number;
    pilgrimageCooldown?: number;
    addTraits?: PythiaTraitId[];
  };
  campaignModifiers?: {
    reputation?: number;
    treasuryProgress?: number;
  };
  worldBias?: {
    climate?: number;
    economy?: number;
    divineMood?: number;
    oracleDensity?: number;
    war?: number;
    trade?: number;
    faith?: number;
    intrigue?: number;
    unrest?: number;
    pressure?: number;
  };
};

export type PoliticalEventDef = {
  id: string;
  label: string;
  domain: DomainTag;
  agenda: FactionAgenda;
  summaries: string[];
};

export type ConsultationQuestionDef = {
  id: string;
  text: string;
  domain: DomainTag;
  tags?: string[];
};

export type PhilosopherThreatDef = {
  id: PhilosopherId;
  name: string;
  school: PhilosopherSchool;
  doctrine: string;
  domain: DomainTag;
  favoredAgenda: FactionAgenda;
  preferredProfiles: FactionProfile[];
  preferredWorldviews: string[];
  consultationTags: string[];
  stageThresholds: {
    circle: number;
    sect: number;
    crisis: number;
  };
  pressureBias: PhilosopherPressureBias;
  stageEffects: Record<PhilosopherThreatStage, PhilosopherEffectVector>;
};

export type RivalOracleOperationDef = {
  id: RivalOracleOperationId;
  label: string;
  kind: RivalOracleOperationKind;
  domain: DomainTag;
  summary: string;
  basePressure: number;
  baseVisibility: number;
  baseIntel: number;
  patronageShift: number;
};

export type RivalOracleDef = {
  id: RivalOracleId;
  name: string;
  title: string;
  summary: string;
  homeRegionId: string;
  favoredDomain: DomainTag;
  baselinePressure: number;
  secrecy: number;
  pressureCap: number;
  patronPool: FactionId[];
  preferredPatronProfiles: FactionProfile[];
  preferredPatronAgendas: FactionAgenda[];
  operationIds: RivalOracleOperationId[];
};

export type NamedCharacterDef = {
  id: NamedCharacterArchetypeId;
  role: NamedCharacterRole;
  label: string;
  cadence: NamedCharacterCadence;
  minInitialCount: number;
  maxInitialCount: number;
  baseInfluence: number;
  baseProminence: number;
  titlePool: string[];
  firstNamePool: string[];
  epithetPool: string[];
  preferredAgendas?: FactionAgenda[];
  preferredProfiles?: FactionProfile[];
  preferredDomains?: DomainTag[];
  initialTags: string[];
};

export type TechId =
  | "masonry_i"
  | "carpentry_i"
  | "advanced_masonry"
  | "advanced_carpentry"
  | "efficient_quarrying"
  | "efficient_logging"
  | "ritual_architecture"
  | "sacred_geometry"
  | "archival_methods"
  | "extended_logistics"
  | "population_management"
  | "refined_incense"
  | "bronze_tools"
  | "monumental_construction"
  | "oracle_expansion"
  | "advanced_agriculture"
  | "diplomatic_protocol"
  | "sacred_architecture"
  | "espionage_tradecraft"
  | "civic_planning";

export type TechCategory = "construction" | "ritual" | "economy" | "knowledge";

export type TechEffect =
  | { kind: "unlock_building"; buildingId: BuildingDefId }
  | { kind: "production_bonus"; buildingId: BuildingDefId; recipeId: string; multiplier: number }
  | { kind: "housing_bonus"; buildingId: BuildingDefId; bonusSlots: Partial<HousingCapacity> }
  | { kind: "upkeep_reduction"; buildingId: BuildingDefId; resourceId: ResourceId; multiplier: number }
  | { kind: "construction_speed"; multiplier: number }
  | { kind: "carrier_capacity"; bonus: number }
  | { kind: "storage_bonus"; resourceId: ResourceId; bonusCapacity: number }
  | { kind: "credibility_bonus"; multiplier: number }
  | { kind: "prestige_bonus"; value: number }
  | { kind: "espionage_bonus"; successRateBonus: number; unlockTrait?: string };

export type TechDef = {
  id: TechId;
  name: string;
  description: string;
  category: TechCategory;
  knowledgeCost: number;
  requires?: TechId[];
  effects: TechEffect[];
};

// ── Event Chain System ──

export type EventChainId = string;

export type EventTriggerCondition =
  | { kind: "resource_below"; resourceId: ResourceId; threshold: number }
  | { kind: "resource_above"; resourceId: ResourceId; threshold: number }
  | { kind: "faction_credibility_below"; factionId?: FactionId; threshold: number }
  | { kind: "faction_debt_above"; threshold: number }
  | { kind: "faction_at_war" }
  | { kind: "philosopher_stage"; stage: PhilosopherThreatStage }
  | { kind: "rival_pressure_above"; threshold: number }
  | { kind: "reputation_tier"; tier: ReputationTierId }
  | { kind: "age_reached"; ageId: string }
  | { kind: "prophecy_failed_recently"; withinDays: number }
  | { kind: "prophecy_succeeded_recently"; withinDays: number }
  | { kind: "building_count_above"; defId?: BuildingDefId; count: number }
  | { kind: "season"; season: SeasonName }
  | { kind: "random_chance"; probability: number }
  | { kind: "consultation_pending" }
  | { kind: "crisis_active" }
  | { kind: "season_is"; season: SeasonName }
  | { kind: "active_chain_count"; min?: number; max?: number }
  | { kind: "chain_domain_active"; domain: DomainTag };

export type EventStageOutcome =
  | { kind: "resource_delta"; resourceId: ResourceId; amount: number }
  | { kind: "faction_relation_delta"; factionA: FactionId; factionB: FactionId; delta: number }
  | { kind: "credibility_delta"; factionId: FactionId; delta: number }
  | { kind: "reputation_delta"; delta: number }
  | { kind: "spawn_consultation"; factionId: FactionId; domain: DomainTag; urgency: number }
  | { kind: "philosopher_pressure"; philosopherId: PhilosopherId; delta: number }
  | { kind: "rival_pressure"; rivalId: RivalOracleId; delta: number }
  | { kind: "trade_disruption"; factionId: FactionId; durationMonths: number }
  | { kind: "building_damage"; defId?: BuildingDefId; conditionLoss: number }
  | { kind: "pilgrim_surge"; amount: number }
  | { kind: "unlock_event_chain"; chainId: EventChainId }
  | { kind: "add_burden"; burdenKind: string };

export type EventStage = {
  id: string;
  label: string;
  description: string;
  durationDays: number;
  outcomes: EventStageOutcome[];
  choiceA?: { label: string; outcomes: EventStageOutcome[] };
  choiceB?: { label: string; outcomes: EventStageOutcome[] };
  nextStageId?: string;
  nextStageCondition?: EventTriggerCondition;
};

export type EventChainDef = {
  id: EventChainId;
  label: string;
  domain: DomainTag;
  triggerConditions: EventTriggerCondition[];
  triggerCooldownDays: number;
  stages: EventStage[];
  maxConcurrent: number;
};
