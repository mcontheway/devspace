import { randomUUID } from "node:crypto";
import type { WorkspaceMode, WorkspaceStore } from "./workspace-store.js";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ServerConfig } from "./config.js";
import { createManagedWorktree } from "./git-worktrees.js";
import { assertAllowedPath, isPathInsideRoot, resolveAllowedPath } from "./roots.js";

export interface LoadedAgentsFile {
  path: string;
  content: string;
  alreadyLoaded: boolean;
}

export interface WorkspaceWorktree {
  path: string;
  baseRef: string;
  baseSha: string;
  dirtySource: boolean;
  detached: boolean;
  managed: boolean;
}

export interface Workspace {
  id: string;
  root: string;
  mode: WorkspaceMode;
  sourceRoot?: string;
  worktree?: WorkspaceWorktree;
  loadedAgentsFiles: Map<string, string>;
}

export interface WorkspaceContext {
  workspace: Workspace;
  agentsFiles: LoadedAgentsFile[];
}

export interface OpenWorkspaceInput {
  path: string;
  mode?: WorkspaceMode;
  baseRef?: string;
}

export class WorkspaceRegistry {
  private readonly workspaces = new Map<string, Workspace>();

  constructor(
    private readonly config: ServerConfig,
    private readonly store?: WorkspaceStore,
  ) {}

  async openWorkspace(input: string | OpenWorkspaceInput): Promise<WorkspaceContext> {
    const options = typeof input === "string" ? { path: input } : input;
    const mode = options.mode ?? "checkout";

    if (mode === "worktree") {
      return this.openWorktreeWorkspace(options.path, options.baseRef);
    }

    return this.openCheckoutWorkspace(options.path);
  }

  getWorkspace(workspaceId: string): Workspace {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      this.store?.touchSession(workspaceId);
      return workspace;
    }

    const session = this.store?.getSession(workspaceId);
    if (!session) {
      throw new Error(`Unknown workspaceId: ${workspaceId}. Call open_workspace first.`);
    }

    const root = this.assertWorkspaceRootAllowed(session.root, session.mode, session.sourceRoot);
    const restoredWorkspace: Workspace = {
      id: session.id,
      root,
      mode: session.mode,
      sourceRoot: session.sourceRoot,
      worktree:
        session.mode === "worktree"
          ? {
              path: root,
              baseRef: session.baseRef ?? "HEAD",
              baseSha: session.baseSha ?? "",
              dirtySource: false,
              detached: true,
              managed: session.managed,
            }
          : undefined,
      loadedAgentsFiles: new Map(
        this.store
          ?.listLoadedAgentFiles(workspaceId)
          .map((file) => [file.path, file.content]) ?? [],
      ),
    };
    this.store?.touchSession(workspaceId);
    this.workspaces.set(restoredWorkspace.id, restoredWorkspace);

    return restoredWorkspace;
  }

  resolvePath(workspace: Workspace, inputPath: string): string {
    const absolutePath = resolveAllowedPath(inputPath, workspace.root, [workspace.root]);
    if (!isPathInsideRoot(absolutePath, workspace.root)) {
      throw new Error(`Path is outside workspace root: ${inputPath}`);
    }

    return absolutePath;
  }

  resolveWorkingDirectory(workspace: Workspace, workingDirectory: string | undefined): string {
    const directory = workingDirectory ? this.resolvePath(workspace, workingDirectory) : workspace.root;
    return assertAllowedPath(directory, [workspace.root]);
  }

  async loadAgentsForPath(workspace: Workspace, absolutePath: string): Promise<LoadedAgentsFile[]> {
    const directory = await this.pathDirectory(absolutePath);
    return this.loadAgentsForDirectory(workspace, directory);
  }

  async loadAgentsForDirectory(workspace: Workspace, directory: string): Promise<LoadedAgentsFile[]> {
    const resolvedDirectory = assertAllowedPath(directory, [workspace.root]);
    const directories = directoriesBetween(workspace.root, resolvedDirectory);
    const loaded: LoadedAgentsFile[] = [];

    for (const currentDirectory of directories) {
      const agentsPath = join(currentDirectory, "AGENTS.md");
      const content = await readOptionalTextFile(agentsPath);
      if (content === undefined) continue;

      const existingContent = workspace.loadedAgentsFiles.get(agentsPath);
      const alreadyLoaded = existingContent === content;
      if (!alreadyLoaded) {
        workspace.loadedAgentsFiles.set(agentsPath, content);
        this.store?.putLoadedAgentFile({
          workspaceSessionId: workspace.id,
          path: agentsPath,
          content,
        });
      }

      loaded.push({ path: agentsPath, content, alreadyLoaded });
    }

    return loaded;
  }

  private async openCheckoutWorkspace(path: string): Promise<WorkspaceContext> {
    const root = assertAllowedPath(path, this.config.allowedRoots);
    await mkdir(root, { recursive: true });

    const rootStats = await stat(root);
    if (!rootStats.isDirectory()) {
      throw new Error(`Workspace root must be a directory: ${path}`);
    }

    return this.createWorkspaceContext({ root, mode: "checkout" });
  }

  private async openWorktreeWorkspace(path: string, baseRef: string | undefined): Promise<WorkspaceContext> {
    const worktree = await createManagedWorktree({
      sourcePath: path,
      baseRef,
      config: this.config,
    });

    return this.createWorkspaceContext({
      root: worktree.path,
      mode: "worktree",
      sourceRoot: worktree.sourceRoot,
      worktree,
    });
  }

  private async createWorkspaceContext(input: {
    root: string;
    mode: WorkspaceMode;
    sourceRoot?: string;
    worktree?: WorkspaceWorktree;
  }): Promise<WorkspaceContext> {
    const workspace: Workspace = {
      id: `ws_${randomUUID()}`,
      root: input.root,
      mode: input.mode,
      sourceRoot: input.sourceRoot,
      worktree: input.worktree,
      loadedAgentsFiles: new Map(),
    };

    this.store?.createSession({
      id: workspace.id,
      root: workspace.root,
      mode: workspace.mode,
      sourceRoot: workspace.sourceRoot,
      baseRef: workspace.worktree?.baseRef,
      baseSha: workspace.worktree?.baseSha,
      managed: workspace.worktree?.managed,
    });
    this.workspaces.set(workspace.id, workspace);
    const agentsFiles = await this.loadAgentsForDirectory(workspace, workspace.root);

    return { workspace, agentsFiles };
  }

  private assertWorkspaceRootAllowed(root: string, mode: WorkspaceMode, sourceRoot: string | undefined): string {
    if (mode === "worktree") {
      if (!sourceRoot) {
        throw new Error(`Stored worktree workspace is missing sourceRoot: ${root}`);
      }
      assertAllowedPath(sourceRoot, this.config.allowedRoots);
      return assertAllowedPath(root, [this.config.worktreeRoot]);
    }

    return assertAllowedPath(root, this.config.allowedRoots);
  }

  private async pathDirectory(absolutePath: string): Promise<string> {
    try {
      const pathStats = await stat(absolutePath);
      return pathStats.isDirectory() ? absolutePath : dirname(absolutePath);
    } catch {
      return dirname(absolutePath);
    }
  }
}

async function readOptionalTextFile(path: string): Promise<string | undefined> {
  try {
    await access(path);
    return await readFile(path, "utf-8");
  } catch {
    return undefined;
  }
}

function directoriesBetween(root: string, directory: string): string[] {
  const resolvedRoot = resolve(root);
  const resolvedDirectory = resolve(directory);
  const relationship = relative(resolvedRoot, resolvedDirectory);

  if (relationship === "") return [resolvedRoot];
  if (relationship.startsWith("..") || relationship === ".." || relationship.includes(`..${sep}`)) {
    throw new Error(`Directory is outside workspace root: ${directory}`);
  }

  const parts = relationship.split(sep).filter(Boolean);
  const directories = [resolvedRoot];
  let current = resolvedRoot;
  for (const part of parts) {
    current = join(current, part);
    directories.push(current);
  }

  return directories;
}

export function formatAgentsNotice(agentsFiles: LoadedAgentsFile[]): string | undefined {
  const newAgentsFiles = agentsFiles.filter((file) => !file.alreadyLoaded);
  if (newAgentsFiles.length === 0) return undefined;

  const sections = newAgentsFiles.map((file) => `## ${file.path} (newly loaded)\n\n${file.content}`);

  return `AGENTS.md context for this workspace path:\n\n${sections.join("\n\n")}`;
}
