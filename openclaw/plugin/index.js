import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(pluginRoot, "..", "..");
const schemaRoot = resolve(repoRoot, "packages", "contracts", "openclaw-tools", "v1");
const toolRunner = resolve(repoRoot, "openclaw", "plugin_tools", "run_tool.sh");
const skillsAllowlist = resolve(repoRoot, "apps", "cli", "src", "concentray_cli", "skills", "skills.yaml");
const defaultStore = resolve(repoRoot, ".data", "store.json");

const toolDefinitions = [
  {
    id: "task_get_next",
    title: "Task Get Next",
    description: "Inspect the next eligible Concentray task for OpenClaw.",
    schemaFile: "task_get_next.input.schema.json",
  },
  {
    id: "task_claim_next",
    title: "Task Claim Next",
    description: "Claim the next eligible Concentray task for this OpenClaw worker.",
    schemaFile: "task_claim_next.input.schema.json",
  },
  {
    id: "task_get",
    title: "Task Get",
    description: "Fetch a Concentray task with its notes, activity, and active run.",
    schemaFile: "task_get.input.schema.json",
  },
  {
    id: "task_update",
    title: "Task Update",
    description: "Update a Concentray task and manage lifecycle transitions.",
    schemaFile: "task_update.input.schema.json",
  },
  {
    id: "task_heartbeat",
    title: "Task Heartbeat",
    description: "Refresh the lease on the currently claimed Concentray task.",
    schemaFile: "task_heartbeat.input.schema.json",
  },
  {
    id: "activity_add",
    title: "Activity Add",
    description: "Add machine activity to a Concentray task timeline.",
    schemaFile: "activity_add.input.schema.json",
  },
  {
    id: "context_export",
    title: "Context Export",
    description: "Export structured Concentray context for a task.",
    schemaFile: "context_export.input.schema.json",
  },
  {
    id: "skill_run",
    title: "Skill Run",
    description: "Run an allowlisted Concentray local skill for a task.",
    schemaFile: "skill_run.input.schema.json",
  },
];

function loadSchema(schemaFile) {
  return JSON.parse(readFileSync(resolve(schemaRoot, schemaFile), "utf8"));
}

function normalizeEnv() {
  const env = { ...process.env };
  env.CONCENTRAY_ROOT = env.CONCENTRAY_ROOT || repoRoot;
  env.TM_PROVIDER = env.TM_PROVIDER || "local_json";
  env.TM_UPDATED_BY = env.TM_UPDATED_BY || "AI";
  env.TM_SKILLS_ALLOWLIST = env.TM_SKILLS_ALLOWLIST || skillsAllowlist;
  if (!env.TM_LOCAL_STORE && !env.TM_WORKSPACE) {
    env.TM_LOCAL_STORE = defaultStore;
  }
  return env;
}

function runConcentrayTool(toolId, input) {
  const child = spawnSync("bash", [toolRunner, toolId], {
    cwd: repoRoot,
    env: normalizeEnv(),
    input: JSON.stringify(input ?? {}),
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });

  if (child.error) {
    throw child.error;
  }

  const stdout = child.stdout?.trim() || "";
  const stderr = child.stderr?.trim() || "";
  let payload = {};

  if (stdout) {
    try {
      payload = JSON.parse(stdout);
    } catch {
      payload = { ok: false, error: `Non-JSON response from Concentray tool ${toolId}`, raw: stdout };
    }
  }

  if (child.status !== 0) {
    const message =
      typeof payload === "object" && payload && "error" in payload && payload.error
        ? String(payload.error)
        : stderr || stdout || `Concentray tool ${toolId} failed`;
    throw new Error(message);
  }

  return payload;
}

function renderToolPayload(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export default function concentrayPlugin(api) {
  for (const tool of toolDefinitions) {
    api.registerTool({
      name: tool.id,
      description: tool.description,
      parameters: loadSchema(tool.schemaFile),
      async execute(_callId, params) {
        const payload = runConcentrayTool(tool.id, params ?? {});
        return renderToolPayload(payload);
      },
    });
  }
}
