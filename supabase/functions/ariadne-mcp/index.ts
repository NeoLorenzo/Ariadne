import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const MCP_SERVER_VERSION = "0.1.0";
const DOMAIN_NAMES = ["strategy", "projects", "tasks", "signals", "goat_lab"] as const;
const DEFAULT_DOMAINS = [...DOMAIN_NAMES];
const MAX_LIST_ITEMS = 500;

const GOAT_TABLES = [
  ["scores", "goat_score_entries", "entry_date.desc"],
  ["strength_lifts", "goat_strength_lifts", "performed_at.desc"],
  ["cognitive_tests", "goat_cognitive_tests", "taken_at.desc"],
  ["academic_stages", "goat_academic_stage_results", "created_at.desc"],
  ["academic_modules", "goat_academic_module_results", "created_at.desc"],
  ["health", "goat_health_characteristics", "updated_at.desc"],
  ["cv", "goat_cv_characteristics", "updated_at.desc"],
  ["misc", "goat_misc_characteristics", "updated_at.desc"],
  ["immutable", "goat_immutable_characteristics", "updated_at.desc"],
  ["academic_notes", "goat_academic_notes", "updated_at.desc"],
  ["strength_profile", "goat_strength_profile", "updated_at.desc"]
] as const;

type DomainName = (typeof DOMAIN_NAMES)[number];
type JsonObject = Record<string, unknown>;
type QueryValue = string | number | boolean;

type SelectOptions = {
  select?: string;
  limit?: number;
  order?: string;
  filters?: Record<string, QueryValue>;
};

type AriadneDataClient = ReturnType<typeof createDataClient>;

const mcpHandler = createMcpHandler(({ requestInfo }) => {
  if (!requestInfo) {
    throw new Error("Ariadne MCP requires an HTTP request context.");
  }

  return createAriadneServer(createDataClient(requestInfo));
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return preflightResponse(request);
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  const authError = await requireAriadneOwner(request);
  if (authError) {
    return withCors(authError, request);
  }

  try {
    const response = await mcpHandler.fetch(request);
    return withCors(response, request);
  } catch (error) {
    console.error("Ariadne MCP request failed", error);
    return withCors(
      jsonResponse({ error: "Ariadne MCP request failed." }, 500),
      request
    );
  }
});

function createAriadneServer(dataClient: AriadneDataClient) {
  const server = new McpServer({
    name: "ariadne",
    version: MCP_SERVER_VERSION
  });

  server.registerTool(
    "get_strategy",
    {
      description:
        "Read Ariadne's active direction, strategic objectives, and outcome goals. Optionally include revision history.",
      inputSchema: z.object({
        includeHistory: z.boolean().default(false)
      }),
      annotations: readOnlyAnnotations()
    },
    async ({ includeHistory }) => toolJson(() => dataClient.loadStrategy(includeHistory))
  );

  server.registerTool(
    "get_projects",
    {
      description:
        "Read the canonical Ariadne coding-project collection from Supabase.",
      inputSchema: z.object({
        includeArchived: z.boolean().default(false)
      }),
      annotations: readOnlyAnnotations()
    },
    async ({ includeArchived }) => toolJson(() => dataClient.loadProjects(includeArchived))
  );

  server.registerTool(
    "get_tasks",
    {
      description:
        "Read Ariadne tasks in their stored order. Completed and deleted tasks are excluded by default.",
      inputSchema: z.object({
        includeCompleted: z.boolean().default(false),
        includeDeleted: z.boolean().default(false),
        limit: z.number().int().min(1).max(MAX_LIST_ITEMS).default(200)
      }),
      annotations: readOnlyAnnotations()
    },
    async ({ includeCompleted, includeDeleted, limit }) =>
      toolJson(() =>
        dataClient.loadTasks({ includeCompleted, includeDeleted, limit })
      )
  );

  server.registerTool(
    "get_signals",
    {
      description:
        "Read Ariadne's canonical cached external signals, currently including the Substack publication signal.",
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations()
    },
    async () => toolJson(() => dataClient.loadSignals())
  );

  server.registerTool(
    "get_goat_lab",
    {
      description:
        "Read the authenticated GOAT Lab datasets intentionally stored in Ariadne's private Supabase tables.",
      inputSchema: z.object({
        limitPerDataset: z.number().int().min(1).max(MAX_LIST_ITEMS).default(200)
      }),
      annotations: readOnlyAnnotations()
    },
    async ({ limitPerDataset }) =>
      toolJson(() => dataClient.loadGoatLab(limitPerDataset))
  );

  server.registerTool(
    "get_workspace_state",
    {
      description:
        "Read a combined Ariadne workspace snapshot across selected canonical domains.",
      inputSchema: z.object({
        domains: z.array(z.enum(DOMAIN_NAMES)).min(1).max(DOMAIN_NAMES.length).default(DEFAULT_DOMAINS),
        includeStrategyHistory: z.boolean().default(false),
        includeCompletedTasks: z.boolean().default(false),
        includeDeletedTasks: z.boolean().default(false),
        includeArchivedProjects: z.boolean().default(false),
        taskLimit: z.number().int().min(1).max(MAX_LIST_ITEMS).default(200),
        goatLimitPerDataset: z.number().int().min(1).max(MAX_LIST_ITEMS).default(200)
      }),
      annotations: readOnlyAnnotations()
    },
    async (input) =>
      toolJson(() => dataClient.loadWorkspace(input))
  );

  registerJsonResource(
    server,
    "strategy",
    "ariadne://strategy",
    "Ariadne strategy",
    "Active direction, strategic objectives, and outcome goals.",
    () => dataClient.loadStrategy(false)
  );
  registerJsonResource(
    server,
    "projects",
    "ariadne://projects",
    "Ariadne projects",
    "Current non-archived coding projects.",
    () => dataClient.loadProjects(false)
  );
  registerJsonResource(
    server,
    "tasks",
    "ariadne://tasks",
    "Ariadne tasks",
    "Current incomplete, non-deleted tasks.",
    () => dataClient.loadTasks({ includeCompleted: false, includeDeleted: false, limit: 200 })
  );
  registerJsonResource(
    server,
    "signals",
    "ariadne://signals",
    "Ariadne signals",
    "Canonical cached external signals.",
    () => dataClient.loadSignals()
  );
  registerJsonResource(
    server,
    "goat-lab",
    "ariadne://goat-lab",
    "Ariadne GOAT Lab",
    "Private GOAT Lab datasets, capped per dataset.",
    () => dataClient.loadGoatLab(200)
  );
  registerJsonResource(
    server,
    "workspace",
    "ariadne://workspace",
    "Ariadne workspace",
    "Combined current Ariadne workspace snapshot.",
    () =>
      dataClient.loadWorkspace({
        domains: DEFAULT_DOMAINS,
        includeStrategyHistory: false,
        includeCompletedTasks: false,
        includeDeletedTasks: false,
        includeArchivedProjects: false,
        taskLimit: 200,
        goatLimitPerDataset: 200
      })
  );

  return server;
}

function registerJsonResource(
  server: McpServer,
  name: string,
  uri: string,
  title: string,
  description: string,
  loader: () => Promise<unknown>
) {
  server.registerResource(
    name,
    uri,
    { title, description, mimeType: "application/json" },
    async (resourceUri) => {
      const data = await loader();
      return {
        contents: [
          {
            uri: resourceUri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    }
  );
}

function createDataClient(request: Request) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const apiKey = request.headers.get("apikey") || requireEnv("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    throw new Error("Missing Authorization header.");
  }

  const headers = {
    Accept: "application/json",
    apikey: apiKey,
    Authorization: authorization
  };

  async function selectRows(table: string, options: SelectOptions = {}) {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", options.select || "*");
    if (options.limit) {
      url.searchParams.set("limit", String(options.limit));
    }
    if (options.order) {
      url.searchParams.set("order", options.order);
    }
    Object.entries(options.filters || {}).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.error(`Ariadne MCP read failed for ${table}: HTTP ${response.status}`);
      throw new Error(`Ariadne data read failed for ${table}.`);
    }

    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  }

  async function loadStrategy(includeHistory = false) {
    const [directions, objectives, goals] = await Promise.all([
      selectRows("directions", { limit: 50 }),
      selectRows("strategic_objectives", { limit: 100 }),
      selectRows("outcome_goals", { limit: 500 })
    ]);

    const currentDirection =
      directions.find((row) => row?.is_active === true) || directions[0] || null;
    const directionId = String(currentDirection?.id || "");
    const currentObjectives = objectives
      .filter((row) => !directionId || String(row?.direction_id || "") === directionId)
      .sort(byPosition);
    const objectiveIds = new Set(
      currentObjectives.map((row) => String(row?.id || "")).filter(Boolean)
    );
    const currentGoals = goals
      .filter((row) => objectiveIds.has(String(row?.strategic_objective_id || "")))
      .sort(byPosition);

    const strategy: JsonObject = {
      direction: stripUserId(currentDirection),
      strategic_objectives: stripUserIds(currentObjectives),
      outcome_goals: stripUserIds(currentGoals)
    };

    if (includeHistory) {
      const [directionRevisions, goalRevisions] = await Promise.all([
        selectRows("direction_revisions", { limit: 500, order: "created_at.desc" }),
        selectRows("outcome_goal_revisions", { limit: 500, order: "created_at.desc" })
      ]);
      const goalIds = new Set(currentGoals.map((row) => String(row?.id || "")));
      strategy.direction_revisions = stripUserIds(
        directionRevisions.filter(
          (row) => !directionId || String(row?.direction_id || "") === directionId
        )
      );
      strategy.outcome_goal_revisions = stripUserIds(
        goalRevisions.filter((row) =>
          goalIds.has(String(row?.outcome_goal_id || ""))
        )
      );
    }

    return strategy;
  }

  async function loadProjects(includeArchived = false) {
    const rows = await selectRows("user_projects", {
      select: "projects,version,updated_at",
      limit: 1
    });
    const row = rows[0] || {};
    const projects = Array.isArray(row.projects) ? row.projects : [];
    return {
      version: row.version ?? null,
      updated_at: row.updated_at ?? null,
      projects: projects.filter(
        (project) => includeArchived || !isObject(project) || project.isArchived !== true
      )
    };
  }

  async function loadTasks({
    includeCompleted = false,
    includeDeleted = false,
    limit = 200
  }: {
    includeCompleted?: boolean;
    includeDeleted?: boolean;
    limit?: number;
  }) {
    const rows = await selectRows("user_tasks", {
      select: "tasks,version,updated_at",
      limit: 1
    });
    const row = rows[0] || {};
    const tasks = Array.isArray(row.tasks) ? row.tasks : [];
    const visibleTasks = tasks.filter((task) => {
      if (!isObject(task)) {
        return true;
      }
      if (!includeDeleted && task.deleted === true) {
        return false;
      }
      if (!includeCompleted && task.completed === true) {
        return false;
      }
      return true;
    });

    return {
      version: row.version ?? null,
      updated_at: row.updated_at ?? null,
      total_matching: visibleTasks.length,
      tasks: visibleTasks.slice(0, clampLimit(limit))
    };
  }

  async function loadSignals() {
    return stripUserIds(
      await selectRows("external_signal_cache", {
        limit: MAX_LIST_ITEMS,
        order: "checked_at.desc"
      })
    );
  }

  async function loadGoatLab(limitPerDataset = 200) {
    const limit = clampLimit(limitPerDataset);
    const entries = await Promise.all(
      GOAT_TABLES.map(async ([key, table, order]) => [
        key,
        stripUserIds(await selectRows(table, { limit, order }))
      ])
    );
    return Object.fromEntries(entries);
  }

  async function loadWorkspace(input: {
    domains: readonly DomainName[];
    includeStrategyHistory: boolean;
    includeCompletedTasks: boolean;
    includeDeletedTasks: boolean;
    includeArchivedProjects: boolean;
    taskLimit: number;
    goatLimitPerDataset: number;
  }) {
    const domains = [...new Set(input.domains)];
    const entries = await Promise.all(
      domains.map(async (domain) => {
        switch (domain) {
          case "strategy":
            return [domain, await loadStrategy(input.includeStrategyHistory)];
          case "projects":
            return [domain, await loadProjects(input.includeArchivedProjects)];
          case "tasks":
            return [
              domain,
              await loadTasks({
                includeCompleted: input.includeCompletedTasks,
                includeDeleted: input.includeDeletedTasks,
                limit: input.taskLimit
              })
            ];
          case "signals":
            return [domain, await loadSignals()];
          case "goat_lab":
            return [domain, await loadGoatLab(input.goatLimitPerDataset)];
        }
      })
    );

    return {
      generated_at: new Date().toISOString(),
      domains: Object.fromEntries(entries)
    };
  }

  return {
    loadStrategy,
    loadProjects,
    loadTasks,
    loadSignals,
    loadGoatLab,
    loadWorkspace
  };
}

async function requireAriadneOwner(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(
      { error: "Bearer authentication is required." },
      401,
      { "WWW-Authenticate": 'Bearer realm="ariadne-mcp"' }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey = request.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !apiKey) {
    return jsonResponse({ error: "Supabase authentication is unavailable." }, 500);
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/is_ariadne_owner`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: "{}"
    });

    if (response.status === 401) {
      return jsonResponse(
        { error: "Invalid or expired bearer token." },
        401,
        { "WWW-Authenticate": 'Bearer realm="ariadne-mcp"' }
      );
    }
    if (!response.ok) {
      console.error(`Ariadne owner check failed: HTTP ${response.status}`);
      return jsonResponse({ error: "Authorization check failed." }, 502);
    }

    const isOwner = await response.json();
    if (isOwner !== true) {
      return jsonResponse({ error: "Not authorized." }, 403);
    }
    return null;
  } catch (error) {
    console.error("Ariadne owner check failed", error);
    return jsonResponse({ error: "Authorization check failed." }, 502);
  }
}

async function toolJson(loader: () => Promise<unknown>) {
  try {
    const data = await loader();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }]
    };
  } catch (error) {
    console.error("Ariadne MCP tool failed", error);
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : "Ariadne tool failed."
        }
      ]
    };
  }
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
}

function stripUserIds(rows: unknown[]) {
  return rows.map(stripUserId);
}

function stripUserId(value: unknown) {
  if (!isObject(value)) {
    return value;
  }
  const { user_id: _userId, ...rest } = value;
  return rest;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function byPosition(left: unknown, right: unknown) {
  const leftPosition = isObject(left) ? Number(left.position || 0) : 0;
  const rightPosition = isObject(right) ? Number(right.position || 0) : 0;
  return leftPosition - rightPosition;
}

function clampLimit(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 200;
  }
  return Math.max(1, Math.min(MAX_LIST_ITEMS, Math.trunc(numeric)));
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || isAllowedOrigin(origin)) {
    return null;
  }
  return jsonResponse({ error: "Origin not allowed." }, 403);
}

function isAllowedOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return true;
    }

    const configured = String(Deno.env.get("ARIADNE_MCP_ALLOWED_ORIGINS") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return configured.some(
      (allowed) => allowed === origin || allowed === parsed.hostname
    );
  } catch {
    return false;
  }
}

function preflightResponse(request: Request) {
  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }
  return withCors(new Response(null, { status: 204 }), request);
}

function withCors(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id"
  );
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function jsonResponse(
  payload: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}
