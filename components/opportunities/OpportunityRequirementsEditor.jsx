"use client";

import {
  GhostButton,
  SecondaryButton,
  Select,
  TextArea,
  TextInput
} from "@/components/ui/AriadneUI";
import {
  ACADEMIC_GRADING_SYSTEMS,
  CEFR_LEVELS,
  CITIZENSHIP_MATCH_MODES,
  COMPLETED_EDUCATION_LEVELS,
  COMPARISON_OPERATORS,
  CURRENT_EDUCATION_LEVELS,
  CURRENT_EDUCATION_STATUSES,
  EDUCATION_OPERATORS,
  LANGUAGE_SKILL_SCOPES,
  OPPORTUNITY_REQUIREMENT_TYPES,
  OPPORTUNITY_REQUIREMENT_TYPE_LABELS,
  PROFESSIONAL_CAREER_STAGES,
  REQUIREMENT_NECESSITIES,
  REQUIREMENT_NECESSITY_LABELS,
  SPONSORSHIP_STATUSES,
  TIME_COMMITMENT_TYPES,
  WORK_AUTHORIZATION_REQUIREMENTS,
  WORK_MODES,
  createOpportunityRequirement,
  normalizeStandardizedRequirements
} from "@/lib/opportunities/opportunityRequirements";
import styles from "./OpportunityLandscape.module.css";

function label(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function options(values) {
  return values.map((value) => <option key={value} value={value}>{label(value)}</option>);
}

function RequirementFields({ requirement, disabled, onPatch }) {
  switch (requirement.type) {
    case "completed_education":
      return <>
        <Select value={requirement.level} onChange={(event) => onPatch({ level: event.target.value })} disabled={disabled} aria-label="Completed education level">
          <option value="">Select level</option>{options(COMPLETED_EDUCATION_LEVELS)}
        </Select>
        <Select value={requirement.operator} onChange={(event) => onPatch({ operator: event.target.value })} disabled={disabled} aria-label="Completed education comparison">
          {options(EDUCATION_OPERATORS)}
        </Select>
      </>;
    case "current_education":
      return <>
        <Select value={requirement.level} onChange={(event) => onPatch({ level: event.target.value })} disabled={disabled} aria-label="Current education level">
          <option value="">Select level</option>{options(CURRENT_EDUCATION_LEVELS)}
        </Select>
        <Select value={requirement.status} onChange={(event) => onPatch({ status: event.target.value })} disabled={disabled} aria-label="Current education status">
          <option value="">Select status</option>{options(CURRENT_EDUCATION_STATUSES)}
        </Select>
      </>;
    case "time_commitment":
      return <>
        <Select value={requirement.commitmentType} onChange={(event) => onPatch({ commitmentType: event.target.value })} disabled={disabled} aria-label="Time commitment type">
          <option value="">Select commitment</option>{options(TIME_COMMITMENT_TYPES)}
        </Select>
        <TextInput type="number" min="0" step="0.5" value={requirement.minHoursPerWeek ?? ""} onChange={(event) => onPatch({ minHoursPerWeek: event.target.value })} placeholder="Min hrs/week" disabled={disabled} />
        <TextInput type="number" min="0" step="0.5" value={requirement.maxHoursPerWeek ?? ""} onChange={(event) => onPatch({ maxHoursPerWeek: event.target.value })} placeholder="Max hrs/week" disabled={disabled} />
        <TextInput type="number" min="0" step="0.5" value={requirement.durationValue ?? ""} onChange={(event) => onPatch({ durationValue: event.target.value })} placeholder="Duration" disabled={disabled} />
        <TextInput value={requirement.durationUnit || ""} onChange={(event) => onPatch({ durationUnit: event.target.value })} placeholder="weeks / months" disabled={disabled} />
        <TextInput value={requirement.fixedSchedule || ""} onChange={(event) => onPatch({ fixedSchedule: event.target.value })} placeholder="Fixed schedule notes" disabled={disabled} />
      </>;
    case "professional_experience":
      return <>
        <TextInput type="number" min="0" step="0.5" value={requirement.minYears ?? ""} onChange={(event) => onPatch({ minYears: event.target.value })} placeholder="Min years" disabled={disabled} />
        <TextInput type="number" min="0" step="0.5" value={requirement.maxYears ?? ""} onChange={(event) => onPatch({ maxYears: event.target.value })} placeholder="Max years" disabled={disabled} />
        <Select value={requirement.careerStage} onChange={(event) => onPatch({ careerStage: event.target.value })} disabled={disabled} aria-label="Career stage">{options(PROFESSIONAL_CAREER_STAGES)}</Select>
        <TextInput value={requirement.experienceArea || ""} onChange={(event) => onPatch({ experienceArea: event.target.value })} placeholder="Experience area" disabled={disabled} />
      </>;
    case "citizenship":
      return <>
        <TextInput value={(requirement.jurisdictions || []).join(", ")} onChange={(event) => onPatch({ jurisdictions: event.target.value })} placeholder="EU_MEMBER_STATE, UK, …" disabled={disabled} />
        <Select value={requirement.matchMode} onChange={(event) => onPatch({ matchMode: event.target.value })} disabled={disabled} aria-label="Citizenship match rule">{options(CITIZENSHIP_MATCH_MODES)}</Select>
      </>;
    case "language_proficiency":
      return <>
        <TextInput value={requirement.language || ""} onChange={(event) => onPatch({ language: event.target.value })} placeholder="Language" disabled={disabled} />
        <Select value={requirement.minimumLevel || ""} onChange={(event) => onPatch({ minimumLevel: event.target.value, framework: event.target.value ? "CEFR" : "" })} disabled={disabled} aria-label="CEFR level">
          <option value="">No explicit CEFR level</option>{options(CEFR_LEVELS)}
        </Select>
        <Select value={requirement.skillScope || "general"} onChange={(event) => onPatch({ skillScope: event.target.value })} disabled={disabled} aria-label="Language skill scope">{options(LANGUAGE_SKILL_SCOPES)}</Select>
        <TextInput value={requirement.rawLevel || ""} onChange={(event) => onPatch({ rawLevel: event.target.value })} placeholder="Source wording, e.g. excellent" disabled={disabled} />
      </>;
    case "academic_performance":
      return <>
        <Select value={requirement.gradingSystem} onChange={(event) => onPatch({ gradingSystem: event.target.value })} disabled={disabled} aria-label="Academic grading system">{options(ACADEMIC_GRADING_SYSTEMS)}</Select>
        <TextInput value={requirement.threshold || ""} onChange={(event) => onPatch({ threshold: event.target.value })} placeholder="2:1 / 3.5 / top 10%" disabled={disabled} />
        <Select value={requirement.operator} onChange={(event) => onPatch({ operator: event.target.value })} disabled={disabled} aria-label="Academic comparison">{options(COMPARISON_OPERATORS)}</Select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.82rem" }}>
          <input type="checkbox" checked={Boolean(requirement.equivalentAllowed)} onChange={(event) => onPatch({ equivalentAllowed: event.target.checked })} disabled={disabled} />
          Equivalent qualifications allowed
        </label>
      </>;
    case "work_authorization":
      return <>
        <TextInput value={requirement.jurisdiction || ""} onChange={(event) => onPatch({ jurisdiction: event.target.value })} placeholder="UK / EU / US" disabled={disabled} />
        <Select value={requirement.authorizationRequirement} onChange={(event) => onPatch({ authorizationRequirement: event.target.value })} disabled={disabled} aria-label="Authorization requirement">{options(WORK_AUTHORIZATION_REQUIREMENTS)}</Select>
        <Select value={requirement.sponsorship} onChange={(event) => onPatch({ sponsorship: event.target.value })} disabled={disabled} aria-label="Visa sponsorship">{options(SPONSORSHIP_STATUSES)}</Select>
        <TextInput value={requirement.relocationSupport || ""} onChange={(event) => onPatch({ relocationSupport: event.target.value })} placeholder="Relocation support (optional)" disabled={disabled} />
      </>;
    case "work_mode":
      return <>
        <Select value={requirement.mode} onChange={(event) => onPatch({ mode: event.target.value })} disabled={disabled} aria-label="Work mode">
          <option value="">Select mode</option>{options(WORK_MODES)}
        </Select>
        <TextInput value={requirement.primaryLocation || ""} onChange={(event) => onPatch({ primaryLocation: event.target.value })} placeholder="Primary location" disabled={disabled} />
        <TextInput value={requirement.requiredTravel || ""} onChange={(event) => onPatch({ requiredTravel: event.target.value })} placeholder="Required travel" disabled={disabled} />
        <TextInput value={requirement.attendanceFrequency || ""} onChange={(event) => onPatch({ attendanceFrequency: event.target.value })} placeholder="Attendance frequency" disabled={disabled} />
      </>;
    default:
      return null;
  }
}

export default function OpportunityRequirementsEditor({ standardizedRequirements = [], miscRequirements = "", disabled = false, onChange }) {
  const requirements = normalizeStandardizedRequirements(standardizedRequirements);

  const emit = (nextRequirements = requirements, nextMisc = miscRequirements) => {
    onChange?.({ standardizedRequirements: normalizeStandardizedRequirements(nextRequirements), miscRequirements: nextMisc });
  };

  const addRequirement = () => emit([...requirements, createOpportunityRequirement("completed_education")]);
  const removeRequirement = (id) => emit(requirements.filter((requirement) => requirement.id !== id));
  const patchRequirement = (id, patch) => emit(requirements.map((requirement) => requirement.id === id ? { ...requirement, ...patch } : requirement));
  const changeType = (requirement, type) => {
    const replacement = createOpportunityRequirement(type);
    emit(requirements.map((item) => item.id === requirement.id ? {
      ...replacement,
      id: requirement.id,
      necessity: requirement.necessity,
      sourceText: requirement.sourceText
    } : item));
  };

  return <>
    <div className={styles.fieldFull}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "0.6rem" }}>
        <label>Standardized requirements</label>
        {!disabled ? <SecondaryButton type="button" onClick={addRequirement}>+ Add requirement</SecondaryButton> : null}
      </div>

      {requirements.length === 0 ? (
        <p className={styles.muted} style={{ margin: 0 }}>No standardized requirements yet.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {requirements.map((requirement) => (
            <section key={requirement.id} style={{ border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))", borderRadius: "10px", padding: "0.85rem", display: "grid", gap: "0.65rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto", gap: "0.55rem", alignItems: "center" }}>
                <Select value={requirement.type} onChange={(event) => changeType(requirement, event.target.value)} disabled={disabled} aria-label="Requirement type">
                  {OPPORTUNITY_REQUIREMENT_TYPES.map((type) => <option key={type} value={type}>{OPPORTUNITY_REQUIREMENT_TYPE_LABELS[type]}</option>)}
                </Select>
                <Select value={requirement.necessity} onChange={(event) => patchRequirement(requirement.id, { necessity: event.target.value })} disabled={disabled} aria-label="Requirement necessity">
                  {REQUIREMENT_NECESSITIES.map((necessity) => <option key={necessity} value={necessity}>{REQUIREMENT_NECESSITY_LABELS[necessity]}</option>)}
                </Select>
                {!disabled ? <GhostButton type="button" onClick={() => removeRequirement(requirement.id)} aria-label="Remove requirement">Remove</GhostButton> : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.55rem", alignItems: "center" }}>
                <RequirementFields requirement={requirement} disabled={disabled} onPatch={(patch) => patchRequirement(requirement.id, patch)} />
              </div>

              <TextInput
                value={requirement.sourceText || ""}
                onChange={(event) => patchRequirement(requirement.id, { sourceText: event.target.value })}
                placeholder="Original source wording (optional)"
                disabled={disabled}
              />
            </section>
          ))}
        </div>
      )}
    </div>

    <div className={styles.fieldFull}>
      <label htmlFor="opportunity-misc-requirements">Miscellaneous requirements</label>
      <TextArea
        id="opportunity-misc-requirements"
        size="medium"
        rows={4}
        value={miscRequirements}
        onChange={(event) => emit(requirements, event.target.value)}
        placeholder="Anything that does not fit the standardized requirement types…"
        disabled={disabled}
      />
    </div>
  </>;
}
