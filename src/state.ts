import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { CreatorWorkflowState } from "./creator.ts";

// Video readiness approvals, keyed by Creator project id. T3 runs one stdio
// copy of the plugin per agent session plus one in its pool, so a panel's
// approval and an agent's publish may land in different processes: state is
// read from and written to one file every copy shares, never kept in memory.
export type CreatorStateStore = {
  get(projectId: string): Promise<CreatorWorkflowState>;
  save(projectId: string, state: CreatorWorkflowState): Promise<void>;
};

type StateFile = { workflows?: Record<string, CreatorWorkflowState> };

export function fileStateStore(path: string): CreatorStateStore {
  const read = async (): Promise<StateFile> => {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as StateFile) : {};
    } catch {
      return {};
    }
  };
  return {
    async get(projectId) {
      return (await read()).workflows?.[projectId] ?? {};
    },
    async save(projectId, state) {
      const file = await read();
      const next: StateFile = { ...file, workflows: { ...file.workflows, [projectId]: { ...state, projectId } } };
      await mkdir(dirname(path), { recursive: true });
      // Write-then-rename so a concurrent reader never sees a partial file.
      const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, JSON.stringify(next, null, 2));
      await rename(temp, path);
    },
  };
}

export function memoryStateStore(): CreatorStateStore {
  const workflows = new Map<string, CreatorWorkflowState>();
  return {
    get: async (projectId) => workflows.get(projectId) ?? {},
    save: async (projectId, state) => void workflows.set(projectId, { ...state, projectId }),
  };
}
