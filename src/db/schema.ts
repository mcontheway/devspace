import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaceSessions = sqliteTable(
  "workspace_sessions",
  {
    id: text("id").primaryKey(),
    root: text("root").notNull(),
    status: text("status").notNull().default("active"),
    mode: text("mode").notNull().default("checkout"),
    sourceRoot: text("source_root"),
    baseRef: text("base_ref"),
    baseSha: text("base_sha"),
    managed: text("managed").notNull().default("false"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
  },
  (table) => [
    index("workspace_sessions_root_idx").on(table.root, table.lastUsedAt),
    index("workspace_sessions_status_idx").on(table.status, table.lastUsedAt),
  ],
);

export const loadedAgentFiles = sqliteTable(
  "loaded_agent_files",
  {
    workspaceSessionId: text("workspace_session_id")
      .notNull()
      .references(() => workspaceSessions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    content: text("content").notNull(),
    loadedAt: text("loaded_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceSessionId, table.path] }),
    index("loaded_agent_files_path_idx").on(table.path),
  ],
);

export const toolResults = sqliteTable(
  "tool_results",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    workspaceRoot: text("workspace_root"),
    tool: text("tool").notNull(),
    path: text("path"),
    label: text("label"),
    createdAt: text("created_at").notNull(),
    summaryJson: text("summary_json").notNull(),
    payloadJson: text("payload_json").notNull(),
  },
  (table) => [
    index("tool_results_workspace_idx").on(table.workspaceId, table.createdAt),
    index("tool_results_root_idx").on(table.workspaceRoot, table.createdAt),
    index("tool_results_tool_idx").on(table.tool, table.createdAt),
  ],
);

export type WorkspaceSessionRow = typeof workspaceSessions.$inferSelect;
export type NewWorkspaceSessionRow = typeof workspaceSessions.$inferInsert;
export type LoadedAgentFileRow = typeof loadedAgentFiles.$inferSelect;
export type NewLoadedAgentFileRow = typeof loadedAgentFiles.$inferInsert;
export type ToolResultRow = typeof toolResults.$inferSelect;
export type NewToolResultRow = typeof toolResults.$inferInsert;
