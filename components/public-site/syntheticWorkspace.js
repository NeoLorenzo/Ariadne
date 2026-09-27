// Synthetic, fictional workspace used only by the signed-out public surface.
// Nothing here is read from, or written to, a private Ariadne workspace.

export const VECTORS = [
  "Physical",
  "Psychological",
  "Intellectual",
  "Professional",
  "Financial",
  "Relational",
  "Creative",
  "Experiential"
];

export const CURRENT_POSITION = [
  { vector: "Physical", score: 62, confidence: "Medium confidence", directions: 1 },
  { vector: "Psychological", score: 71, confidence: "High confidence", directions: 1 },
  { vector: "Intellectual", score: 84, confidence: "High confidence", directions: 2 },
  { vector: "Professional", score: 58, confidence: "Medium confidence", directions: 2 },
  { vector: "Financial", score: 46, confidence: "Medium confidence", directions: 1 },
  { vector: "Relational", score: null, confidence: "No assessment", directions: 1 },
  { vector: "Creative", score: 76, confidence: "High confidence", directions: 1 },
  { vector: "Experiential", score: 68, confidence: "Medium confidence", directions: 0 }
];

export const DIRECTIONS = [
  {
    id: "d1",
    title: "Become a credible ML researcher",
    statement: "Build the depth, evidence and relationships to do original research on how learning systems fail.",
    vectors: ["Intellectual", "Professional"]
  },
  {
    id: "d2",
    title: "Build a sustainable creative practice",
    statement: "Publish consistently and turn writing into an audience that compounds.",
    vectors: ["Creative", "Financial", "Relational"]
  },
  {
    id: "d3",
    title: "Train for a first marathon",
    statement: "Rebuild an aerobic base and finish a spring marathon healthy.",
    vectors: ["Physical", "Psychological"]
  }
];

export const OBJECTIVES = [
  { id: "o1", direction: "d1", title: "Publish original research" },
  { id: "o2", direction: "d1", title: "Earn a place in a research lab" },
  { id: "o3", direction: "d2", title: "Ship one essay every month" },
  { id: "o4", direction: "d2", title: "Reach 1,000 subscribers" },
  { id: "o5", direction: "d3", title: "Run 40 km a week by March" }
];

export const TASKS = [
  { id: "t1", objective: "o1", title: "Draft methods section", priority: 1, due: "Due in 2d" },
  { id: "t2", objective: "o2", title: "Apply: Frontier Safety Fellowship", priority: 1, due: "Closes in 3d" },
  { id: "t3", objective: "o1", title: "Replicate eval baseline", priority: 2 },
  { id: "t4", objective: "o3", title: "Outline the October essay", priority: 2, due: "Target in 5d" },
  { id: "t5", objective: "o4", title: "Add a newsletter signup page", priority: 3 },
  { id: "t6", objective: "o5", title: "Long run — 18 km easy", priority: 2, due: "Saturday" },
  { id: "t7", objective: "o5", title: "Book a physio assessment", priority: 3 }
];

export const NOTICES = [
  { level: "danger", label: "Danger", text: "Newsletter has no publication for 34 days." },
  { level: "major", label: "Major warning", text: "thesis-experiments has no commit for 19 days." },
  { level: "warning", label: "Warning", text: "portfolio-site has no commit for 9 days." }
];

export const REPOSITORIES = [
  { name: "ml-evals", committed: "12m", activity: "333213230312332103320231332133", state: "ok" },
  { name: "essay-drafts", committed: "3h", activity: "102010021001020100102000101021", state: "ok" },
  { name: "training-log", committed: "1d", activity: "101101101101011010110101101100", state: "ok" },
  { name: "portfolio-site", committed: "9d", activity: "231202113020123012031000000000", state: "warning" },
  { name: "thesis-experiments", committed: "19d", activity: "323312021130000000000000000000", state: "major" }
];

export const PRIORITY_LABELS = { 1: "Critical", 2: "High", 3: "Medium", 4: "Low" };
