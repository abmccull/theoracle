import type { DifficultyId, LegendaryConsultationId, OriginId, PythiaArchetypeId, ResourceId, ScenarioId, TechId } from "@the-oracle/content";

import type { BuildingDefId, Coord, FactionId, PlacementTool, TreatyKind } from "../state/gameState";
import type { EspionageAgentCover, EspionageOperationKind, EspionageAgentStatus } from "../state/espionage";
import type { BurdenId } from "../state/lineage";

export type PlaceRoadCommand = {
  type: "PlaceRoadCommand";
  tile: Coord;
};

export type PlaceBuildingCommand = {
  type: "PlaceBuildingCommand";
  defId: Exclude<BuildingDefId, "sacred_way">;
  tile: Coord;
};

export type AssignPriestCommand = {
  type: "AssignPriestCommand";
  priestId: string;
  buildingId: string;
};

export type SetGameSpeedCommand = {
  type: "SetGameSpeedCommand";
  speed: 0 | 1 | 2 | 3;
};

export type AdvanceTickCommand = {
  type: "AdvanceTickCommand";
  ticks: number;
};

export type StartConsultationCommand = {
  type: "StartConsultationCommand";
  consultationId?: string;
};

export type PlaceProphecyTileCommand = {
  type: "PlaceProphecyTileCommand";
  tileId: string;
};

export type RemoveProphecyTileCommand = {
  type: "RemoveProphecyTileCommand";
  tileId: string;
};

export type DeliverProphecyCommand = {
  type: "DeliverProphecyCommand";
};

export type SaveGameCommand = {
  type: "SaveGameCommand";
  slotId: string;
};

export type LoadGameCommand = {
  type: "LoadGameCommand";
  slotId: string;
};

export type PurchaseTradeOfferCommand = {
  type: "PurchaseTradeOfferCommand";
  offerId: string;
};

export type RestPythiaCommand = {
  type: "RestPythiaCommand";
};

export type PurifyPythiaCommand = {
  type: "PurifyPythiaCommand";
};

export type SetToolCommand = {
  type: "SetToolCommand";
  tool: PlacementTool;
};

export type SelectEntityCommand = {
  type: "SelectEntityCommand";
  entityId?: string;
  entityKind?: "building" | "walker";
};

export type HoverTileCommand = {
  type: "HoverTileCommand";
  tile?: Coord;
};

export type InjectScenarioCommand = {
  type: "InjectScenarioCommand";
  scenario: "foundation" | "low-incense" | "consultation-ready" | "logistics-lab" | "campaign-lab" | "world-map-lab";
};

export type RepairBuildingCommand = {
  type: "RepairBuildingCommand";
  buildingId: string;
};

export type StartNewRunCommand = {
  type: "StartNewRunCommand";
  seed?: number | string;
  originId?: OriginId;
  scenarioId?: ScenarioId;
  difficultyId?: DifficultyId;
  pythiaArchetypeId?: PythiaArchetypeId;
  startingRegionId?: string;
};

export type IssuePriestDecreeCommand = {
  type: "IssuePriestDecreeCommand";
  decreeType: "calm" | "reform" | "investigate";
};

export type DismissPriestCommand = {
  type: "DismissPriestCommand";
  priestId: string;
};

export type EndorseBlocCommand = {
  type: "EndorseBlocCommand";
  blocId: string;
};

export type BeginExcavationCommand = {
  type: "BeginExcavationCommand";
  siteId: string;
};

export type ClaimRelicCommand = {
  type: "ClaimRelicCommand";
  siteId: string;
  layerDepth: number;
};

export type ActivateSacredSiteCommand = {
  type: "ActivateSacredSiteCommand";
  siteId: string;
};

export type LaunchEspionageOperationCommand = {
  type: "LaunchEspionageOperationCommand";
  operationKind: EspionageOperationKind;
  agentId: string;
  targetId: string;
};

export type InvestigatePriestCommand = {
  type: "InvestigatePriestCommand";
  priestId: string;
};

export type RecruitAgentCommand = {
  type: "RecruitAgentCommand";
  cover: EspionageAgentCover;
  targetFactionId: FactionId;
};

export type DeployAgentCommand = {
  type: "DeployAgentCommand";
  agentId: string;
  operationKind: EspionageOperationKind;
  targetId: string;
};

export type RecallAgentCommand = {
  type: "RecallAgentCommand";
  agentId: string;
};

export type RansomAgentCommand = {
  type: "RansomAgentCommand";
  agentId: string;
};

export type InterrogateAgentCommand = {
  type: "InterrogateAgentCommand";
  agentId: string;
};

export type TriggerEndOfRunCommand = {
  type: "TriggerEndOfRunCommand";
};

export type BeginLegendaryConsultationCommand = {
  type: "BeginLegendaryConsultationCommand";
  consultationId: LegendaryConsultationId;
};

export type AdvanceLegendaryStageCommand = {
  type: "AdvanceLegendaryStageCommand";
  consultationId: LegendaryConsultationId;
};

export type StartNewLineageRunCommand = {
  type: "StartNewLineageRunCommand";
  originId: OriginId;
  seedText: string;
  burdens: BurdenId[];
  endlessMode: boolean;
};

export type RecordLineageRunCommand = {
  type: "RecordLineageRunCommand";
};

export type HireWorkerCommand = {
  type: "HireWorkerCommand";
  role: "carrier" | "custodian";
};

export type StartResearchCommand = {
  type: "StartResearchCommand";
  techId: TechId;
};

export type SelectResearchCommand = {
  type: "SELECT_RESEARCH";
  techId: string;
};

export type CancelResearchCommand = {
  type: "CancelResearchCommand";
};

export type EventChainChoiceCommand = {
  type: "EventChainChoiceCommand";
  chainInstanceId: string;
  choice: "a" | "b";
};

export type AcceptPatronCommand = {
  type: "AcceptPatronCommand";
  contractId: string;
};

export type RejectPatronCommand = {
  type: "RejectPatronCommand";
  contractId: string;
};

export type BorrowGoldCommand = {
  type: "BorrowGoldCommand";
  factionId: FactionId;
  amount: number;
};

export type RepayLoanCommand = {
  type: "RepayLoanCommand";
  loanId: string;
};

export type ProposeTreatyCommand = {
  type: "ProposeTreatyCommand";
  factionId: FactionId;
  offerType: TreatyKind;
  goldPerMonth?: number;
};

export type RespondToDemandsCommand = {
  type: "RespondToDemandsCommand";
  demandId: string;
  response: "accept" | "negotiate" | "refuse";
};

export type CounterStrikeRivalCommand = {
  type: "CounterStrikeRivalCommand";
  rivalId: string;
};

export type AssignWorkerCommand = {
  type: "AssignWorkerCommand";
  walkerId: string;
  buildingId: string;
};

export type UnassignWorkerCommand = {
  type: "UnassignWorkerCommand";
  walkerId: string;
  buildingId: string;
};

export type SellResourceCommand = {
  type: "SELL_RESOURCE";
  resourceId: ResourceId;
  amount: number;
  targetFactionId: string;
};

export type DemolishBuildingCommand = {
  type: "DEMOLISH_BUILDING";
  buildingId: string;
};

export type GameCommand =
  | PlaceRoadCommand
  | PlaceBuildingCommand
  | AssignPriestCommand
  | SetGameSpeedCommand
  | AdvanceTickCommand
  | StartConsultationCommand
  | PlaceProphecyTileCommand
  | RemoveProphecyTileCommand
  | DeliverProphecyCommand
  | SaveGameCommand
  | LoadGameCommand
  | PurchaseTradeOfferCommand
  | RestPythiaCommand
  | PurifyPythiaCommand
  | RepairBuildingCommand
  | SetToolCommand
  | SelectEntityCommand
  | HoverTileCommand
  | InjectScenarioCommand
  | StartNewRunCommand
  | IssuePriestDecreeCommand
  | DismissPriestCommand
  | EndorseBlocCommand
  | BeginExcavationCommand
  | ClaimRelicCommand
  | ActivateSacredSiteCommand
  | LaunchEspionageOperationCommand
  | InvestigatePriestCommand
  | RecruitAgentCommand
  | DeployAgentCommand
  | RecallAgentCommand
  | RansomAgentCommand
  | InterrogateAgentCommand
  | TriggerEndOfRunCommand
  | BeginLegendaryConsultationCommand
  | AdvanceLegendaryStageCommand
  | StartNewLineageRunCommand
  | RecordLineageRunCommand
  | HireWorkerCommand
  | StartResearchCommand
  | SelectResearchCommand
  | CancelResearchCommand
  | EventChainChoiceCommand
  | AcceptPatronCommand
  | RejectPatronCommand
  | BorrowGoldCommand
  | RepayLoanCommand
  | ProposeTreatyCommand
  | RespondToDemandsCommand
  | CounterStrikeRivalCommand
  | AssignWorkerCommand
  | UnassignWorkerCommand
  | SellResourceCommand
  | DemolishBuildingCommand;
