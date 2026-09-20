import {
  APPLICATION_COMPONENT_TYPES,
  getApplicationComponents,
  getRawRequirementsText
} from "./opportunityRequirements";

const APPLICATION_COMPONENT_TYPE_SET = new Set(APPLICATION_COMPONENT_TYPES);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slug(value) {
  return text(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "component";
}

export function inferApplicationComponentType(labelInput) {
  const label = text(labelInput).toLowerCase();
  if (!label) return "other";
  if (/\b(cv|resume|résumé)\b/.test(label)) return "cv_resume";
  if (/\bcover(ing)?\s+letter\b/.test(label)) return "cover_letter";
  if (/\b(reference|references|referee|referees|recommender|recommenders|recommendation letter|recommendation letters)\b/.test(label)) return "references";
  if (/\bwriting sample\b/.test(label)) return "writing_sample";
  if (/\b(research proposal|statement of research interest)\b/.test(label)) return "research_proposal";
  if (/\babstract\b/.test(label)) return "abstract";
  if (/\bportfolio\b/.test(label)) return "portfolio";
  if (/\bscreencast\b/.test(label)) return "screencast";
  if (/\b(online application|application form)\b/.test(label)) return "application_form";
  if (/\b(transcript|transcripts|degree transcript|degree transcripts|academic transcript|academic transcripts)\b/.test(label)) return "transcript";
  return "other";
}

export function inferApplicationComponentCount(labelInput) {
  const label = text(labelInput).toLowerCase();
  if (/\b(two|2)\b/.test(label)) return 2;
  if (/\b(three|3)\b/.test(label)) return 3;
  if (/\b(four|4)\b/.test(label)) return 4;
  return 1;
}

export function repairLegacyApplicationComponentTuple(node, index = 0) {
  if (!Array.isArray(node)) return null;
  const label = node.find((item) => typeof item === "string") || "";
  const markers = node.filter(
    (item) => item && typeof item === "object" && !Array.isArray(item) && item.kind === "application_component"
  );
  if (!label || markers.length === 0) return null;

  return {
    id: `application-component-legacy-${slug(label)}-${index + 1}`,
    kind: "application_component",
    componentType: inferApplicationComponentType(label),
    count: inferApplicationComponentCount(label),
    details: "",
    sourceText: text(label)
  };
}

function normalizeCanonicalComponent(input, index = 0) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (text(input.kind).toLowerCase() !== "application_component") return null;
  const sourceText = text(input.sourceText ?? input.source_text ?? input.details);
  const componentType = text(input.componentType ?? input.component_type);
  return {
    id: text(input.id) || `application-component-repaired-${slug(sourceText || componentType)}-${index + 1}`,
    kind: "application_component",
    componentType: APPLICATION_COMPONENT_TYPE_SET.has(componentType) ? componentType : inferApplicationComponentType(sourceText),
    count: Math.max(1, Number(input.count) || inferApplicationComponentCount(sourceText)),
    details: text(input.details),
    sourceText
  };
}

function componentKey(component) {
  return [
    text(component.componentType).toLowerCase(),
    text(component.sourceText).toLowerCase(),
    Number(component.count) || 1
  ].join("|");
}

export function repairRequirementDocument({
  standardizedRequirements = [],
  applicationComponents = [],
  rawRequirementsText = ""
} = {}) {
  const document = Array.isArray(standardizedRequirements) ? standardizedRequirements : [];
  const repairedDocument = [];
  const components = [];
  let repairedCount = 0;

  document.forEach((node, index) => {
    if (Array.isArray(node)) {
      const repaired = repairLegacyApplicationComponentTuple(node, index);
      if (repaired) {
        components.push(repaired);
        repairedCount += 1;
      }
      return;
    }
    if (!node || typeof node !== "object") return;
    if (text(node.kind).toLowerCase() === "application_component") {
      const component = normalizeCanonicalComponent(node, index);
      if (component) components.push(component);
      return;
    }
    if (text(node.kind).toLowerCase() === "source_text") return;
    repairedDocument.push(node);
  });

  (Array.isArray(applicationComponents) ? applicationComponents : []).forEach((node, index) => {
    if (Array.isArray(node)) {
      const repaired = repairLegacyApplicationComponentTuple(node, index);
      if (repaired) {
        components.push(repaired);
        repairedCount += 1;
      }
      return;
    }
    const component = normalizeCanonicalComponent(node, index);
    if (component) components.push(component);
  });

  const uniqueComponents = [];
  const seen = new Set();
  components.forEach((component) => {
    const key = componentKey(component);
    if (seen.has(key)) return;
    seen.add(key);
    uniqueComponents.push(component);
  });

  const sourceText =
    text(rawRequirementsText) ||
    getRawRequirementsText(document);

  const sourceNode = {
    id: "requirements-source",
    kind: "source_text",
    rawText: sourceText
  };

  return {
    standardizedRequirements: [
      ...repairedDocument,
      ...uniqueComponents,
      sourceNode
    ],
    applicationComponents: uniqueComponents,
    rawRequirementsText: sourceText,
    repairedCount
  };
}

function validateComponent(component, path, errors) {
  if (!component || typeof component !== "object" || Array.isArray(component)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (text(component.kind).toLowerCase() !== "application_component") {
    errors.push(`${path} must have kind application_component.`);
    return;
  }
  if (!text(component.id)) errors.push(`${path} must have an id.`);
  const componentType = text(component.componentType ?? component.component_type);
  if (!APPLICATION_COMPONENT_TYPE_SET.has(componentType)) {
    errors.push(`${path} has an invalid component type.`);
  }
  if (!Number.isFinite(Number(component.count)) || Number(component.count) < 1) {
    errors.push(`${path} must have a positive count.`);
  }
}

function validateNodeShape(node, path, errors) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    errors.push(`${path} must be an object; legacy tuple/array nodes are not allowed.`);
    return;
  }
  const kind = text(node.kind).toLowerCase();
  if (kind === "application_component") validateComponent(node, path, errors);
  if (kind === "group") {
    if (!Array.isArray(node.children)) {
      errors.push(`${path}.children must be a list.`);
      return;
    }
    node.children.forEach((child, index) => validateNodeShape(child, `${path}.children[${index}]`, errors));
  }
}

export function validateRequirementDocumentIntegrity({
  standardizedRequirements = [],
  applicationComponents = []
} = {}) {
  const errors = [];
  if (!Array.isArray(standardizedRequirements)) {
    errors.push("Standardized requirements must be a list.");
  } else {
    standardizedRequirements.forEach((node, index) =>
      validateNodeShape(node, `standardizedRequirements[${index}]`, errors)
    );
  }

  if (!Array.isArray(applicationComponents)) {
    errors.push("Application components must be a list.");
  } else {
    applicationComponents.forEach((component, index) =>
      validateComponent(component, `applicationComponents[${index}]`, errors)
    );
  }
  return errors;
}

export function getRequirementExtractionCoverage({
  standardizedRequirements = [],
  rawRequirementsText = "",
  descriptionIsExcerpt = false
} = {}) {
  if (descriptionIsExcerpt) {
    return {
      status: "unknown",
      reason: "Source description is explicitly incomplete, so absent requirements cannot be treated as absent."
    };
  }

  const document = Array.isArray(standardizedRequirements) ? standardizedRequirements : [];
  const criteriaCount = document.filter((node) =>
    node && typeof node === "object" && !Array.isArray(node) &&
    ["requirement", "group"].includes(text(node.kind).toLowerCase())
  ).length;
  const sourceText = text(rawRequirementsText) || getRawRequirementsText(document);

  if (sourceText && criteriaCount === 0) {
    return {
      status: "incomplete",
      reason: "Source requirements text exists but no structured eligibility criteria are represented."
    };
  }

  return {
    status: "complete",
    reason: criteriaCount
      ? "Structured eligibility criteria are present."
      : "No source requirement text indicates missing structured eligibility criteria."
  };
}

export function getDocumentApplicationComponents(standardizedRequirements = []) {
  return getApplicationComponents(standardizedRequirements);
}
