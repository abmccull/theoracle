import { WorldMapPanel } from "./WorldMapPanel";
import type {
  RunSetupCityOption,
  RunSetupDifficultyOption,
  RunSetupOriginOption,
  RunSetupPythiaOption,
  RunSetupScenarioOption,
  RunSetupWorldPreview,
  WorldFactionShare,
  WorldHistoryEntry,
  WorldMetric,
  WorldPressureSummary
} from "./worldPreview";
import { clampMeter, toneClass } from "./worldPreview";

type RunSetupPanelProps = {
  title?: string;
  eyebrow?: string;
  seed: string;
  onSeedChange?: (seed: string) => void;
  onSeedRandomize?: () => void;
  scenarios: RunSetupScenarioOption[];
  selectedScenarioId?: string;
  onSelectScenario?: (scenarioId: string) => void;
  difficulties: RunSetupDifficultyOption[];
  selectedDifficultyId?: string;
  onSelectDifficulty?: (difficultyId: string) => void;
  origins: RunSetupOriginOption[];
  selectedOriginId?: string;
  onSelectOrigin?: (originId: string) => void;
  pythias: RunSetupPythiaOption[];
  selectedPythiaId?: string;
  onSelectPythia?: (pythiaId: string) => void;
  startingCities: RunSetupCityOption[];
  selectedStartingCityId?: string;
  onSelectStartingCity?: (cityId: string) => void;
  preview?: RunSetupWorldPreview;
  onStart?: () => void;
  startLabel?: string;
  disabled?: boolean;
  note?: string;
  idPrefix?: string;
};

function renderMetricCard(metric: WorldMetric) {
  const meter = clampMeter(metric.meter);

  return (
    <div className={`setup-metric-card ${toneClass(metric.tone)}`}>
      <div className="section-title">{metric.label}</div>
      <div className="headline">{metric.value}</div>
      {metric.detail ? <div className="campaign-copy">{metric.detail}</div> : null}
      {typeof meter === "number" ? (
        <div className="campaign-meter">
          <div className={`campaign-meter-fill ${toneClass(metric.tone)}`} style={{ width: `${meter}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function renderFactionMix(items: WorldFactionShare[]) {
  if (items.length === 0) {
    return <div className="campaign-copy">Faction mix not generated yet.</div>;
  }

  return (
    <div className="world-chip-row">
      {items.map((item) => (
        <div key={item.id} className={`world-chip ${toneClass(item.tone)}`}>
          <strong>{item.label}</strong>
          {item.value ? <span>{item.value}</span> : null}
          {item.detail ? <span>{item.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}

function renderPressures(items: WorldPressureSummary[]) {
  if (items.length === 0) {
    return <div className="campaign-copy">No global pressures surfaced for this seed.</div>;
  }

  return (
    <div className="setup-pressure-list">
      {items.map((item) => (
        <div key={item.id} className={`pressure-row ${item.severity ?? "watchful"}`}>
          <span>{item.label}</span>
          <span>{item.value ?? item.detail ?? "Watch"}</span>
        </div>
      ))}
    </div>
  );
}

function renderHistory(items: WorldHistoryEntry[]) {
  if (items.length === 0) {
    return <div className="campaign-copy">No world history preview yet.</div>;
  }

  return (
    <div className="history-list">
      {items.map((item) => (
        <div key={item.id} className={`history-row ${toneClass(item.tone)}`}>
          <strong>{item.label}</strong>
          {item.detail ? <span>{item.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}

function renderScenarioCards(
  scenarios: RunSetupScenarioOption[],
  selectedScenarioId: string | undefined,
  onSelectScenario: ((scenarioId: string) => void) | undefined,
  idPrefix: string
) {
  return (
    <div className="run-setup-origin-grid">
      {scenarios.map((scenario) => {
        const active = scenario.id === selectedScenarioId;
        return (
          <button
            key={scenario.id}
            className={`setup-origin-card ${active ? "active" : ""}`}
            data-testid={`${idPrefix}-scenario-${scenario.id}`}
            id={`${idPrefix}-scenario-${scenario.id}`}
            onClick={() => onSelectScenario?.(scenario.id)}
            type="button"
          >
            <span className="section-title">{scenario.label}</span>
            {typeof scenario.difficulty === "number" ? <span className="inspector-subline">Scenario difficulty {scenario.difficulty}/5</span> : null}
            <span className="campaign-copy">{scenario.summary}</span>
            {scenario.recommendedStartingTier ? <span className="campaign-copy">Recommended tier {scenario.recommendedStartingTier}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function renderDifficultyChips(
  difficulties: RunSetupDifficultyOption[],
  selectedDifficultyId: string | undefined,
  onSelectDifficulty: ((difficultyId: string) => void) | undefined,
  idPrefix: string
) {
  return (
    <div className="world-chip-row">
      {difficulties.map((difficulty) => {
        const active = difficulty.id === selectedDifficultyId;
        return (
          <button
            key={difficulty.id}
            className={`world-chip ${toneClass(difficulty.tone)} ${active ? "active" : ""}`}
            data-testid={`${idPrefix}-difficulty-${difficulty.id}`}
            id={`${idPrefix}-difficulty-${difficulty.id}`}
            onClick={() => onSelectDifficulty?.(difficulty.id)}
            type="button"
          >
            <strong>{difficulty.label}</strong>
            <span>{difficulty.summary}</span>
          </button>
        );
      })}
    </div>
  );
}

function renderPythiaCards(
  pythias: RunSetupPythiaOption[],
  selectedPythiaId: string | undefined,
  onSelectPythia: ((pythiaId: string) => void) | undefined,
  idPrefix: string
) {
  return (
    <div className="run-setup-origin-grid">
      {pythias.map((pythia) => {
        const active = pythia.id === selectedPythiaId;
        return (
          <button
            key={pythia.id}
            className={`setup-origin-card ${active ? "active" : ""}`}
            data-testid={`${idPrefix}-pythia-${pythia.id}`}
            id={`${idPrefix}-pythia-${pythia.id}`}
            onClick={() => onSelectPythia?.(pythia.id)}
            type="button"
          >
            <span className="section-title">{pythia.label}</span>
            {pythia.title ? <span className="inspector-subline">{pythia.title}</span> : null}
            <span className="campaign-copy">{pythia.summary}</span>
            {pythia.traits.length ? (
              <span className="world-chip-row">
                {pythia.traits.map((trait) => (
                  <span key={trait} className="world-chip tone-watchful compact">
                    {trait}
                  </span>
                ))}
              </span>
            ) : null}
            {pythia.statline ? <span className="campaign-copy">{pythia.statline}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function renderCityCards(
  cities: RunSetupCityOption[],
  selectedStartingCityId: string | undefined,
  onSelectStartingCity: ((cityId: string) => void) | undefined,
  idPrefix: string
) {
  return (
    <div className="run-setup-origin-grid">
      {cities.map((city) => {
        const active = city.id === selectedStartingCityId;
        return (
          <button
            key={city.id}
            className={`setup-origin-card ${active ? "active" : ""}`}
            data-testid={`${idPrefix}-city-${city.id}`}
            id={`${idPrefix}-city-${city.id}`}
            onClick={() => onSelectStartingCity?.(city.id)}
            type="button"
          >
            <span className="section-title">{city.label}</span>
            {city.controllingFactionLabel ? <span className="inspector-subline">{city.controllingFactionLabel}</span> : null}
            <span className="campaign-copy">{city.summary}</span>
            {city.pressure ? <span className="campaign-copy">Pressure {city.pressure}</span> : null}
            {city.tags?.length ? (
              <span className="world-chip-row">
                {city.tags.map((tag) => (
                  <span key={tag} className="world-chip tone-steady compact">
                    {tag}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function RunSetupPanel({
  title = "Start New Game",
  eyebrow = "Cast the Opening Lots",
  seed,
  onSeedChange,
  onSeedRandomize,
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  difficulties,
  selectedDifficultyId,
  onSelectDifficulty,
  origins,
  selectedOriginId,
  onSelectOrigin,
  pythias,
  selectedPythiaId,
  onSelectPythia,
  startingCities,
  selectedStartingCityId,
  onSelectStartingCity,
  preview,
  onStart,
  startLabel = "Start New Game",
  disabled = false,
  note,
  idPrefix = "run-setup"
}: RunSetupPanelProps) {
  const selectedOrigin = origins.find((origin) => origin.id === selectedOriginId) ?? origins[0];
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId);
  const selectedDifficulty = difficulties.find((difficulty) => difficulty.id === selectedDifficultyId);
  const selectedPythia = pythias.find((pythia) => pythia.id === selectedPythiaId);
  const selectedCity = startingCities.find((city) => city.id === selectedStartingCityId);

  return (
    <section className="run-setup-panel panel">
      <div className="run-setup-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <div className="headline">{title}</div>
          <div className="campaign-copy">Choose the oracle, the seer, the opening polis, and the pressure level before the precinct begins.</div>
        </div>
        <div className="run-setup-actions">
          <label className="seed-field" htmlFor={`${idPrefix}-seed-input`}>
            <span className="section-title">World Seed</span>
            <input
              id={`${idPrefix}-seed-input`}
              data-testid={`${idPrefix}-seed-input`}
              className="seed-input"
              onChange={(event) => onSeedChange?.(event.target.value)}
              placeholder="Delphi-001"
              type="text"
              value={seed}
            />
          </label>
          <button
            className="metal-button"
            id={`${idPrefix}-seed-randomize`}
            data-testid={`${idPrefix}-seed-randomize`}
            onClick={() => onSeedRandomize?.()}
            type="button"
          >
            Randomize
          </button>
          <button
            className="oracle-button"
            id={`${idPrefix}-start-btn`}
            data-testid={`${idPrefix}-start-btn`}
            disabled={disabled}
            onClick={() => onStart?.()}
            type="button"
          >
            {startLabel}
          </button>
        </div>
      </div>
      <div className="run-setup-shell">
        <div className="run-setup-column">
          <div className="campaign-list">
            <div className="section-title">Campaign Arc</div>
            {renderScenarioCards(scenarios, selectedScenarioId, onSelectScenario, idPrefix)}
          </div>
          <div className="campaign-list">
            <div className="section-title">Difficulty</div>
            {renderDifficultyChips(difficulties, selectedDifficultyId, onSelectDifficulty, idPrefix)}
          </div>
          <div className="campaign-list">
            <div className="section-title">Choose an Oracle</div>
            <div className="run-setup-origin-grid">
              {origins.map((origin) => {
                const active = origin.id === selectedOrigin?.id;
                return (
                  <button
                    key={origin.id}
                    className={`setup-origin-card ${active ? "active" : ""}`}
                    disabled={origin.disabled}
                    id={`${idPrefix}-origin-${origin.id}`}
                    data-testid={`${idPrefix}-origin-${origin.id}`}
                    onClick={() => onSelectOrigin?.(origin.id)}
                    type="button"
                  >
                    <span className="section-title">{origin.title ?? origin.label}</span>
                    {origin.subtitle ? <span className="inspector-subline">{origin.subtitle}</span> : null}
                    <span className="campaign-copy">{origin.summary}</span>
                    <span className="campaign-copy">Climate {origin.climate}</span>
                    <span className="campaign-copy">Divine Mood {origin.divineMood}</span>
                    <span className="campaign-copy">Oracle Density {origin.oracleDensity}</span>
                    <span className="campaign-copy">Faction Mix {origin.factionMix}</span>
                    {origin.tags?.length ? (
                      <span className="world-chip-row">
                        {origin.tags.map((tag) => (
                          <span key={tag} className="world-chip tone-steady compact">
                            {tag}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="campaign-list">
            <div className="section-title">Choose the Pythia</div>
            {renderPythiaCards(pythias, selectedPythiaId, onSelectPythia, idPrefix)}
          </div>
          <div className="campaign-list">
            <div className="section-title">Opening Polis</div>
            {renderCityCards(startingCities, selectedStartingCityId, onSelectStartingCity, idPrefix)}
          </div>
        </div>
        <div className="run-setup-column run-setup-preview-column">
          {selectedScenario || selectedDifficulty || selectedPythia || selectedOrigin || selectedCity ? (
            <div className="setup-preview-summary">
              <div className="section-title">Chosen Opening</div>
              <div className="headline">
                {selectedScenario?.label ?? "Campaign"} · {selectedOrigin?.title ?? selectedOrigin?.label ?? "Oracle"} · {selectedPythia?.label ?? "Pythia"}
              </div>
              <div className="campaign-copy">
                {selectedDifficulty?.label ?? "Oracle"} difficulty from {selectedCity?.label ?? "Delphi"}.
              </div>
            </div>
          ) : null}
          <div className="section-title">World Preview</div>
          {preview ? (
            <>
              <div className="setup-preview-summary">
                <div className="headline">{preview.title ?? "Generated World"}</div>
                <div className="campaign-copy">{preview.summary}</div>
              </div>
              <div className="run-setup-metric-grid">
                {renderMetricCard(preview.climate)}
                {renderMetricCard(preview.divineMood)}
                {renderMetricCard(preview.oracleDensity)}
              </div>
              <div className="campaign-list">
                <div className="section-title">Faction Mix</div>
                {renderFactionMix(preview.factionMix)}
              </div>
              <div className="campaign-list">
                <div className="section-title">World Pressures</div>
                {renderPressures(preview.pressures ?? [])}
              </div>
              <div className="campaign-list">
                <div className="section-title">World History</div>
                {renderHistory(preview.history ?? [])}
              </div>
              {preview.map ? <WorldMapPanel preview={preview.map} /> : null}
              {preview.note ? <div className="campaign-copy">{preview.note}</div> : null}
            </>
          ) : (
            <div className="campaign-copy">
              Supply the generated preview payload to show climate, divine mood, oracle density, faction spread, and regional map summaries here.
            </div>
          )}
          {note ? <div className="campaign-copy">{note}</div> : null}
        </div>
      </div>
    </section>
  );
}
