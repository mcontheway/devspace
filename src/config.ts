import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { expandHomePath } from "./roots.js";

export type ToolNamingMode = "legacy" | "short";

export interface ServerConfig {
  host: string;
  port: number;
  authToken?: string;
  allowedRoots: string[];
  allowedHosts: string[];
  publicBaseUrl: string;
  minimalTools: boolean;
  toolNaming: ToolNamingMode;
  stateDir: string;
  worktreeRoot: string;
  skillsEnabled: boolean;
  compactSkills: boolean;
  skillPaths: string[];
  agentDir: string;
}

function parsePort(value: string | undefined): number {
  if (!value) return 7676;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }

  return port;
}

function parseAllowedRoots(value: string | undefined): string[] {
  const rawRoots =
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];

  const roots = rawRoots.length > 0 ? rawRoots : [process.cwd()];
  return roots.map((root) => resolve(expandHomePath(root)));
}

function parseAllowedHosts(value: string | undefined): string[] {
  const rawHosts =
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];

  return rawHosts.length > 0 ? rawHosts : ["localhost", "127.0.0.1"];
}

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.toLowerCase() ?? "");
}

function parseMinimalTools(env: NodeJS.ProcessEnv): boolean {
  return env.DEVSPACE_TOOL_MODE === "minimal" || parseBoolean(env.DEVSPACE_MINIMAL_TOOLS);
}

function parseList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => resolve(expandHomePath(entry))) ?? []
  );
}

function parseToolNaming(value: string | undefined): ToolNamingMode {
  if (!value || value === "legacy") return "legacy";
  if (value === "short") return "short";

  throw new Error(`Invalid DEVSPACE_TOOL_NAMING: ${value}`);
}

function defaultStateDir(): string {
  return join(homedir(), ".local", "share", "devspace");
}

function defaultWorktreeRoot(): string {
  return join(homedir(), ".devspace", "worktrees");
}

function defaultAgentDir(): string {
  return join(homedir(), ".pi", "agent");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.HOST ?? "127.0.0.1",
    port: parsePort(env.PORT),
    authToken: env.DEVSPACE_TOKEN,
    allowedRoots: parseAllowedRoots(env.DEVSPACE_ALLOWED_ROOTS),
    allowedHosts: parseAllowedHosts(env.DEVSPACE_ALLOWED_HOSTS),
    publicBaseUrl: env.DEVSPACE_PUBLIC_BASE_URL ?? "https://agent.gitcms.blog",
    minimalTools: parseMinimalTools(env),
    toolNaming: parseToolNaming(env.DEVSPACE_TOOL_NAMING),
    stateDir: resolve(env.DEVSPACE_STATE_DIR ?? defaultStateDir()),
    worktreeRoot: resolve(expandHomePath(env.DEVSPACE_WORKTREE_ROOT ?? defaultWorktreeRoot())),
    skillsEnabled: parseBoolean(env.DEVSPACE_SKILLS),
    compactSkills: parseBoolean(env.DEVSPACE_COMPACT_SKILLS),
    skillPaths: parseList(env.DEVSPACE_SKILL_PATHS),
    agentDir: resolve(expandHomePath(env.DEVSPACE_AGENT_DIR ?? defaultAgentDir())),
  };
}
