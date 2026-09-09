"use client";

import { useEffect } from "react";
import { GhostButton, SecondaryButton, Select, TextArea, TextInput } from "@/components/ui/AriadneUI";
import {
  ACADEMIC_GRADING_SYSTEMS,
  APPLICATION_COMPONENT_TYPES,
  APPLICATION_COMPONENT_TYPE_LABELS,
  CEFR_LEVELS,
  CITIZENSHIP_MATCH_MODES,
  COMPLETED_EDUCATION_LEVELS,
  COMPARISON_OPERATORS,
  CURRENT_EDUCATION_LEVELS,
  CURRENT_EDUCATION_STATUSES,
  DATE_COMPARISON_OPERATORS,
  EDUCATION_OPERATORS,
  EVIDENCE_TYPES,
  LANGUAGE_SKILL_SCOPES,
  OPPORTUNITY_REQUIREMENT_TYPES,
  OPPORTUNITY_REQUIREMENT_TYPE_LABELS,
  PROFESSIONAL_CAREER_STAGES,
  REQUIREMENT_EVALUATION_TIMES,
  REQUIREMENT_EVALUATION_TIME_LABELS,
  REQUIREMENT_GROUP_OPERATORS,
  REQUIREMENT_NECESSITIES,
  REQUIREMENT_NECESSITY_LABELS,
  REQUIREMENT_STATES,
  REQUIREMENT_STATE_LABELS,
  SECURITY_CLEARANCE_REQUIREMENTS,
  SKILL_LEVELS,
  SPONSORSHIP_STATUSES,
  TIME_COMMITMENT_TYPES,
  WORK_AUTHORIZATION_REQUIREMENTS,
  WORK_MODES,
  buildRequirementDocument,
  createApplicationComponent,
  createOpportunityRequirement,
  createRequirementGroup,
  deriveResidualRequirementsText,
  getApplicationComponents,
  getRawRequirementsText,
  getRequirementCriteriaNodes,
  normalizeRequirementNode,
  normalizeStandardizedRequirements
} from "@/lib/opportunities/opportunityRequirements";
import styles from "./OpportunityLandscape.module.css";

function label(value) { return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function options(values, labels = null) { return values.map((value) => <option key={value} value={value}>{labels?.[value] || label(value)}</option>); }
function listValue(value) { return Array.isArray(value) ? value.join(", ") : ""; }

function RequirementFields({ requirement, disabled, onPatch }) {
  const textList = (field, placeholder) => <TextInput value={listValue(requirement[field])} onChange={(event) => onPatch({ [field]: event.target.value })} placeholder={placeholder} disabled={disabled} />;
  switch (requirement.type) {
    case "age": return <><TextInput type="number" min="0" value={requirement.minAge ?? ""} onChange={(event) => onPatch({ minAge: event.target.value })} placeholder="Minimum age" disabled={disabled} /><TextInput type="number" min="0" value={requirement.maxAge ?? ""} onChange={(event) => onPatch({ maxAge: event.target.value })} placeholder="Maximum age" disabled={disabled} /></>;
    case "completed_education": return <><Select value={requirement.level} onChange={(event) => onPatch({ level: event.target.value })} disabled={disabled}><option value="">Select level</option>{options(COMPLETED_EDUCATION_LEVELS)}</Select><Select value={requirement.operator} onChange={(event) => onPatch({ operator: event.target.value })} disabled={disabled}>{options(EDUCATION_OPERATORS)}</Select></>;
    case "current_education": return <><Select value={requirement.level} onChange={(event) => onPatch({ level: event.target.value })} disabled={disabled}><option value="">Select level</option>{options(CURRENT_EDUCATION_LEVELS)}</Select><Select value={requirement.status} onChange={(event) => onPatch({ status: event.target.value })} disabled={disabled}><option value="">Select status</option>{options(CURRENT_EDUCATION_STATUSES)}</Select></>;
    case "degree_subject": return <>{textList("subjects", "STEM, law, economics, any subject…")}<Select value={requirement.matchMode} onChange={(event) => onPatch({ matchMode: event.target.value })} disabled={disabled}>{options(CITIZENSHIP_MATCH_MODES)}</Select></>;
    case "academic_performance": return <><Select value={requirement.gradingSystem} onChange={(event) => onPatch({ gradingSystem: event.target.value })} disabled={disabled}>{options(ACADEMIC_GRADING_SYSTEMS)}</Select><TextInput value={requirement.threshold || ""} onChange={(event) => onPatch({ threshold: event.target.value })} placeholder="2:1 / 3.5 / strong record" disabled={disabled} /><Select value={requirement.operator} onChange={(event) => onPatch({ operator: event.target.value })} disabled={disabled}>{options(COMPARISON_OPERATORS)}</Select><label><input type="checkbox" checked={Boolean(requirement.equivalentAllowed)} onChange={(event) => onPatch({ equivalentAllowed: event.target.checked })} disabled={disabled} /> Equivalent allowed</label></>;
    case "graduation_timing": return <><Select value={requirement.operator} onChange={(event) => onPatch({ operator: event.target.value })} disabled={disabled}>{options(DATE_COMPARISON_OPERATORS)}</Select><TextInput type="date" value={requirement.date || ""} onChange={(event) => onPatch({ date: event.target.value })} disabled={disabled} /><TextInput type="number" min="1900" value={requirement.year ?? ""} onChange={(event) => onPatch({ year: event.target.value })} placeholder="Or year" disabled={disabled} /></>;
    case "professional_experience": return <><TextInput type="number" min="0" step="0.5" value={requirement.minYears ?? ""} onChange={(event) => onPatch({ minYears: event.target.value })} placeholder="Min years" disabled={disabled} /><TextInput type="number" min="0" step="0.5" value={requirement.maxYears ?? ""} onChange={(event) => onPatch({ maxYears: event.target.value })} placeholder="Max years" disabled={disabled} /><Select value={requirement.careerStage} onChange={(event) => onPatch({ careerStage: event.target.value })} disabled={disabled}>{options(PROFESSIONAL_CAREER_STAGES)}</Select><TextInput value={requirement.experienceArea || ""} onChange={(event) => onPatch({ experienceArea: event.target.value })} placeholder="Experience area" disabled={disabled} /></>;
    case "research_experience": return <><TextInput type="number" min="0" step="0.5" value={requirement.minYears ?? ""} onChange={(event) => onPatch({ minYears: event.target.value })} placeholder="Min research years" disabled={disabled} /><TextInput value={requirement.area || ""} onChange={(event) => onPatch({ area: event.target.value })} placeholder="Research area" disabled={disabled} /><label><input type="checkbox" checked={Boolean(requirement.publicationRequired)} onChange={(event) => onPatch({ publicationRequired: event.target.checked })} disabled={disabled} /> Publication required</label></>;
    case "technical_skill": return <><TextInput value={requirement.skill || ""} onChange={(event) => onPatch({ skill: event.target.value })} placeholder="Python / ML / software engineering…" disabled={disabled} /><Select value={requirement.minimumLevel || ""} onChange={(event) => onPatch({ minimumLevel: event.target.value })} disabled={disabled}><option value="">Level unspecified</option>{options(SKILL_LEVELS)}</Select><label><input type="checkbox" checked={Boolean(requirement.evidenceRequired)} onChange={(event) => onPatch({ evidenceRequired: event.target.checked })} disabled={disabled} /> Evidence required</label></>;
    case "quantitative_ability": return <>{textList("areas", "Math, statistics, empirical analysis…")}<Select value={requirement.minimumLevel || ""} onChange={(event) => onPatch({ minimumLevel: event.target.value })} disabled={disabled}><option value="">Level unspecified</option>{options(SKILL_LEVELS)}</Select></>;
    case "domain_knowledge": return <>{textList("domains", "AI governance, economics, law…")}<Select value={requirement.minimumLevel || ""} onChange={(event) => onPatch({ minimumLevel: event.target.value })} disabled={disabled}><option value="">Level unspecified</option>{options(SKILL_LEVELS)}</Select></>;
    case "language_proficiency": return <><TextInput value={requirement.language || ""} onChange={(event) => onPatch({ language: event.target.value })} placeholder="Language" disabled={disabled} /><Select value={requirement.minimumLevel || ""} onChange={(event) => onPatch({ minimumLevel: event.target.value, framework: event.target.value ? "CEFR" : "" })} disabled={disabled}><option value="">No explicit CEFR level</option>{options(CEFR_LEVELS)}</Select><Select value={requirement.skillScope || "general"} onChange={(event) => onPatch({ skillScope: event.target.value })} disabled={disabled}>{options(LANGUAGE_SKILL_SCOPES)}</Select><TextInput value={requirement.rawLevel || ""} onChange={(event) => onPatch({ rawLevel: event.target.value })} placeholder="Source wording, e.g. excellent" disabled={disabled} /></>;
    case "citizenship": return <>{textList("jurisdictions", "EU_MEMBER_STATE, UK, …")}<Select value={requirement.matchMode} onChange={(event) => onPatch({ matchMode: event.target.value })} disabled={disabled}>{options(CITIZENSHIP_MATCH_MODES)}</Select></>;
    case "residency": return <><TextInput value={requirement.jurisdiction || ""} onChange={(event) => onPatch({ jurisdiction: event.target.value })} placeholder="Jurisdiction" disabled={disabled} /><TextInput type="number" min="0" step="0.5" value={requirement.minYears ?? ""} onChange={(event) => onPatch({ minYears: event.target.value })} placeholder="Min years" disabled={disabled} /><TextInput type="number" min="0" step="0.5" value={requirement.windowYears ?? ""} onChange={(event) => onPatch({ windowYears: event.target.value })} placeholder="Within last N years" disabled={disabled} /><label><input type="checkbox" checked={Boolean(requirement.currentRequired)} onChange={(event) => onPatch({ currentRequired: event.target.checked })} disabled={disabled} /> Current residency required</label></>;
    case "work_authorization": return <><TextInput value={requirement.jurisdiction || ""} onChange={(event) => onPatch({ jurisdiction: event.target.value })} placeholder="UK / EU / US" disabled={disabled} /><Select value={requirement.authorizationRequirement} onChange={(event) => onPatch({ authorizationRequirement: event.target.value })} disabled={disabled}>{options(WORK_AUTHORIZATION_REQUIREMENTS)}</Select><Select value={requirement.sponsorship} onChange={(event) => onPatch({ sponsorship: event.target.value })} disabled={disabled}>{options(SPONSORSHIP_STATUSES)}</Select><TextInput value={requirement.relocationSupport || ""} onChange={(event) => onPatch({ relocationSupport: event.target.value })} placeholder="Relocation support" disabled={disabled} /></>;
    case "security_clearance": return <><TextInput value={requirement.clearance || ""} onChange={(event) => onPatch({ clearance: event.target.value })} placeholder="Clearance type" disabled={disabled} /><TextInput value={requirement.jurisdiction || ""} onChange={(event) => onPatch({ jurisdiction: event.target.value })} placeholder="Jurisdiction" disabled={disabled} /><Select value={requirement.clearanceRequirement} onChange={(event) => onPatch({ clearanceRequirement: event.target.value })} disabled={disabled}>{options(SECURITY_CLEARANCE_REQUIREMENTS)}</Select></>;
    case "work_mode": return <><Select value={requirement.mode} onChange={(event) => onPatch({ mode: event.target.value })} disabled={disabled}><option value="">Select mode</option>{options(WORK_MODES)}</Select><TextInput value={requirement.primaryLocation || ""} onChange={(event) => onPatch({ primaryLocation: event.target.value })} placeholder="Primary location" disabled={disabled} /><TextInput value={requirement.attendanceFrequency || ""} onChange={(event) => onPatch({ attendanceFrequency: event.target.value })} placeholder="Attendance frequency" disabled={disabled} /></>;
    case "travel_requirement": return <><TextInput value={requirement.destination || ""} onChange={(event) => onPatch({ destination: event.target.value })} placeholder="Destination" disabled={disabled} /><TextInput value={requirement.frequency || ""} onChange={(event) => onPatch({ frequency: event.target.value })} placeholder="Frequency" disabled={disabled} /><TextInput type="number" min="0" value={requirement.minimumTrips ?? ""} onChange={(event) => onPatch({ minimumTrips: event.target.value })} placeholder="Minimum trips" disabled={disabled} /></>;
    case "time_commitment": return <><Select value={requirement.commitmentType} onChange={(event) => onPatch({ commitmentType: event.target.value })} disabled={disabled}><option value="">Select commitment</option>{options(TIME_COMMITMENT_TYPES)}</Select><TextInput type="number" min="0" step="0.5" value={requirement.minHoursPerWeek ?? ""} onChange={(event) => onPatch({ minHoursPerWeek: event.target.value })} placeholder="Min hrs/week" disabled={disabled} /><TextInput type="number" min="0" step="0.5" value={requirement.maxHoursPerWeek ?? ""} onChange={(event) => onPatch({ maxHoursPerWeek: event.target.value })} placeholder="Max hrs/week" disabled={disabled} /><TextInput type="number" min="0" step="0.5" value={requirement.durationValue ?? ""} onChange={(event) => onPatch({ durationValue: event.target.value })} placeholder="Duration" disabled={disabled} /><TextInput value={requirement.durationUnit || ""} onChange={(event) => onPatch({ durationUnit: event.target.value })} placeholder="weeks / months" disabled={disabled} /><TextInput value={requirement.fixedSchedule || ""} onChange={(event) => onPatch({ fixedSchedule: event.target.value })} placeholder="Fixed schedule" disabled={disabled} /></>;
    case "availability_window": return <><TextInput type="date" value={requirement.startDate || ""} onChange={(event) => onPatch({ startDate: event.target.value })} disabled={disabled} /><TextInput type="date" value={requirement.endDate || ""} onChange={(event) => onPatch({ endDate: event.target.value })} disabled={disabled} /><TextInput type="number" min="0" step="0.5" value={requirement.minDurationValue ?? ""} onChange={(event) => onPatch({ minDurationValue: event.target.value })} placeholder="Minimum duration" disabled={disabled} /><TextInput value={requirement.minDurationUnit || ""} onChange={(event) => onPatch({ minDurationUnit: event.target.value })} placeholder="weeks / months" disabled={disabled} /></>;
    case "concurrent_study": return <Select value={requirement.studyAllowed ? "allowed" : "not_allowed"} onChange={(event) => onPatch({ studyAllowed: event.target.value === "allowed" })} disabled={disabled}><option value="not_allowed">Cannot study concurrently</option><option value="allowed">Concurrent study allowed</option></Select>;
    case "institutional_affiliation": return <>{textList("affiliations", "University, research institution, employer…")}<Select value={requirement.matchMode} onChange={(event) => onPatch({ matchMode: event.target.value })} disabled={disabled}>{options(CITIZENSHIP_MATCH_MODES)}</Select></>;
    case "application_geography": return <>{textList("jurisdictions", "Portugal, EU, constituency…")}<Select value={requirement.matchMode} onChange={(event) => onPatch({ matchMode: event.target.value })} disabled={disabled}>{options(CITIZENSHIP_MATCH_MODES)}</Select></>;
    case "prior_prerequisite": return <><TextInput value={requirement.prerequisite || ""} onChange={(event) => onPatch({ prerequisite: event.target.value })} placeholder="Course, qualification or equivalent knowledge" disabled={disabled} /><label><input type="checkbox" checked={Boolean(requirement.equivalentAllowed)} onChange={(event) => onPatch({ equivalentAllowed: event.target.checked })} disabled={disabled} /> Equivalent knowledge allowed</label></>;
    case "evidence": return <><Select value={requirement.evidenceType} onChange={(event) => onPatch({ evidenceType: event.target.value })} disabled={disabled}>{options(EVIDENCE_TYPES)}</Select><TextInput type="number" min="0" value={requirement.minCount ?? ""} onChange={(event) => onPatch({ minCount: event.target.value })} placeholder="Minimum count" disabled={disabled} /><TextInput value={requirement.topic || ""} onChange={(event) => onPatch({ topic: event.target.value })} placeholder="Topic / field" disabled={disabled} /></>;
    default: return null;
  }
}

function mapNodes(nodes, id, mapper) {
  return nodes.map((node) => {
    if (node.id === id) return mapper(node);
    if (node.kind === "group") return { ...node, children: mapNodes(node.children || [], id, mapper) };
    return node;
  });
}
function removeNode(nodes, id) { return nodes.filter((node) => node.id !== id).map((node) => node.kind === "group" ? { ...node, children: removeNode(node.children || [], id) } : node); }

function RequirementNodeEditor({ node, depth = 0, disabled, onReplace, onRemove }) {
  if (node.kind === "group") {
    const patch = (next) => onReplace({ ...node, ...next });
    return <section style={{ border: "1px dashed rgba(148,163,184,.35)", borderRadius: 10, padding: ".75rem", marginLeft: depth ? ".7rem" : 0, display: "grid", gap: ".6rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(110px,.7fr) minmax(130px,1fr) minmax(130px,1fr) auto", gap: ".5rem", alignItems: "center" }}>
        <Select value={node.operator} onChange={(event) => patch({ operator: event.target.value })} disabled={disabled}>{options(REQUIREMENT_GROUP_OPERATORS)}</Select>
        {node.operator === "AT_LEAST_N" ? <TextInput type="number" min="1" max={Math.max(1, node.children.length)} value={node.minimumCount || 1} onChange={(event) => patch({ minimumCount: event.target.value })} disabled={disabled} /> : <span />}
        <Select value={node.necessity} onChange={(event) => patch({ necessity: event.target.value })} disabled={disabled}>{options(REQUIREMENT_NECESSITIES, REQUIREMENT_NECESSITY_LABELS)}</Select>
        {!disabled ? <GhostButton type="button" onClick={onRemove}>Remove group</GhostButton> : null}
      </div>
      <TextInput value={node.label || ""} onChange={(event) => patch({ label: event.target.value })} placeholder="Group label (optional)" disabled={disabled} />
      {(node.children || []).map((child) => <RequirementNodeEditor key={child.id} node={child} depth={depth + 1} disabled={disabled} onReplace={(replacement) => patch({ children: mapNodes(node.children, child.id, () => replacement) })} onRemove={() => patch({ children: removeNode(node.children, child.id) })} />)}
      {!disabled ? <div style={{ display: "flex", gap: ".45rem", flexWrap: "wrap" }}><SecondaryButton type="button" onClick={() => patch({ children: [...node.children, createOpportunityRequirement()] })}>+ Requirement</SecondaryButton><SecondaryButton type="button" onClick={() => patch({ children: [...node.children, createRequirementGroup("OR")] })}>+ Nested group</SecondaryButton></div> : null}
    </section>;
  }

  const patch = (next) => onReplace(normalizeRequirementNode({ ...node, ...next }));
  const changeType = (type) => onReplace(normalizeRequirementNode({ ...createOpportunityRequirement(type), id: node.id, necessity: node.necessity, requirementState: node.requirementState, evaluationTime: node.evaluationTime, evaluationDate: node.evaluationDate, sourceText: node.sourceText }));
  return <section style={{ border: "1px solid rgba(148,163,184,.22)", borderRadius: 10, padding: ".75rem", marginLeft: depth ? ".7rem" : 0, display: "grid", gap: ".6rem" }}>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.3fr) minmax(130px,1fr) minmax(120px,.9fr) auto", gap: ".5rem", alignItems: "center" }}>
      <Select value={node.type} onChange={(event) => changeType(event.target.value)} disabled={disabled}>{OPPORTUNITY_REQUIREMENT_TYPES.map((type) => <option key={type} value={type}>{OPPORTUNITY_REQUIREMENT_TYPE_LABELS[type]}</option>)}</Select>
      <Select value={node.necessity} onChange={(event) => patch({ necessity: event.target.value })} disabled={disabled}>{options(REQUIREMENT_NECESSITIES, REQUIREMENT_NECESSITY_LABELS)}</Select>
      <Select value={node.requirementState} onChange={(event) => patch({ requirementState: event.target.value })} disabled={disabled}>{options(REQUIREMENT_STATES, REQUIREMENT_STATE_LABELS)}</Select>
      {!disabled ? <GhostButton type="button" onClick={onRemove}>Remove</GhostButton> : null}
    </div>
    {node.requirementState !== "unrestricted" ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".5rem", alignItems: "center" }}><RequirementFields requirement={node} disabled={disabled} onPatch={patch} /></div> : null}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) minmax(150px,1fr)", gap: ".5rem" }}><Select value={node.evaluationTime} onChange={(event) => patch({ evaluationTime: event.target.value })} disabled={disabled}>{options(REQUIREMENT_EVALUATION_TIMES, REQUIREMENT_EVALUATION_TIME_LABELS)}</Select>{node.evaluationTime === "specific_date" ? <TextInput type="date" value={node.evaluationDate || ""} onChange={(event) => patch({ evaluationDate: event.target.value })} disabled={disabled} /> : <span />}</div>
    <TextInput value={node.sourceText || ""} onChange={(event) => patch({ sourceText: event.target.value })} placeholder="Exact source clause for this criterion" disabled={disabled} />
  </section>;
}

export default function OpportunityRequirementsEditor({ standardizedRequirements = [], miscRequirements = "", disabled = false, onChange }) {
  const document = normalizeStandardizedRequirements(standardizedRequirements);
  const criteria = getRequirementCriteriaNodes(document);
  const applicationComponents = getApplicationComponents(document);
  const rawRequirementsText = getRawRequirementsText(document);
  const residualMisc = deriveResidualRequirementsText(miscRequirements, document);

  const emit = (nextCriteria = criteria, nextMisc = residualMisc, nextComponents = applicationComponents) => {
    const nextDocument = buildRequirementDocument({ criteria: nextCriteria, applicationComponents: nextComponents, rawRequirementsText });
    onChange?.({ standardizedRequirements: nextDocument, miscRequirements: deriveResidualRequirementsText(nextMisc, nextDocument) });
  };

  useEffect(() => {
    if (residualMisc !== miscRequirements) onChange?.({ standardizedRequirements: document, miscRequirements: residualMisc });
  }, [residualMisc, miscRequirements]);

  const replaceCriterion = (id, replacement) => emit(mapNodes(criteria, id, () => replacement));
  const removeCriterion = (id) => emit(removeNode(criteria, id));
  const patchComponent = (id, patch) => emit(criteria, residualMisc, applicationComponents.map((item) => item.id === id ? normalizeRequirementNode({ ...item, ...patch }) : item));
  const removeComponent = (id) => emit(criteria, residualMisc, applicationComponents.filter((item) => item.id !== id));

  return <>
    <div className={styles.fieldFull}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: ".6rem" }}><label>Standardized eligibility criteria</label>{!disabled ? <div style={{ display: "flex", gap: ".45rem" }}><SecondaryButton type="button" onClick={() => emit([...criteria, createOpportunityRequirement()])}>+ Requirement</SecondaryButton><SecondaryButton type="button" onClick={() => emit([...criteria, createRequirementGroup("OR")])}>+ Group</SecondaryButton></div> : null}</div>
      {criteria.length === 0 ? <p className={styles.muted} style={{ margin: 0 }}>No standardized eligibility criteria yet.</p> : <div style={{ display: "grid", gap: ".7rem" }}>{criteria.map((node) => <RequirementNodeEditor key={node.id} node={node} disabled={disabled} onReplace={(replacement) => replaceCriterion(node.id, replacement)} onRemove={() => removeCriterion(node.id)} />)}</div>}
    </div>

    <div className={styles.fieldFull}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: ".6rem" }}><label>Application components</label>{!disabled ? <SecondaryButton type="button" onClick={() => emit(criteria, residualMisc, [...applicationComponents, createApplicationComponent()])}>+ Component</SecondaryButton> : null}</div>
      {applicationComponents.length === 0 ? <p className={styles.muted} style={{ margin: 0 }}>No structured application components.</p> : <div style={{ display: "grid", gap: ".55rem" }}>{applicationComponents.map((component) => <section key={component.id} style={{ display: "grid", gridTemplateColumns: "minmax(150px,.8fr) 90px minmax(180px,1.4fr) auto", gap: ".5rem", alignItems: "center" }}><Select value={component.componentType} onChange={(event) => patchComponent(component.id, { componentType: event.target.value })} disabled={disabled}>{options(APPLICATION_COMPONENT_TYPES, APPLICATION_COMPONENT_TYPE_LABELS)}</Select><TextInput type="number" min="1" value={component.count || 1} onChange={(event) => patchComponent(component.id, { count: event.target.value })} disabled={disabled} /><TextInput value={component.details || ""} onChange={(event) => patchComponent(component.id, { details: event.target.value })} placeholder="Details" disabled={disabled} />{!disabled ? <GhostButton type="button" onClick={() => removeComponent(component.id)}>Remove</GhostButton> : null}<div style={{ gridColumn: "1 / -1" }}><TextInput value={component.sourceText || ""} onChange={(event) => patchComponent(component.id, { sourceText: event.target.value })} placeholder="Exact source clause for this application component" disabled={disabled} /></div></section>)}</div>}
    </div>

    <div className={styles.fieldFull}><label htmlFor="opportunity-misc-requirements">Other eligibility criteria</label><TextArea id="opportunity-misc-requirements" size="medium" rows={4} value={residualMisc} onChange={(event) => emit(criteria, event.target.value, applicationComponents)} placeholder="Only criteria that cannot yet be represented structurally…" disabled={disabled} /></div>

    {rawRequirementsText ? <div className={styles.fieldFull}><details><summary style={{ color: "#94a3b8", cursor: "pointer", fontSize: ".76rem", fontWeight: 700 }}>Original source requirements</summary><p style={{ margin: ".45rem 0 0", whiteSpace: "pre-wrap", color: "#94a3b8", fontSize: ".76rem", lineHeight: 1.45 }}>{rawRequirementsText}</p></details></div> : null}
  </>;
}
