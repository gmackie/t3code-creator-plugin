import { toolData, type CallToolResult, type ViewBridge } from "./bridge.ts";
import { esc, renderView, type ViewData } from "./render.ts";

type Doc = { readonly visibilityState: string };

// Drives one Creator view: renders the tool result the host delivers, then
// refreshes through the same tool every pollSeconds while visible. The video
// readiness view also approves and publishes.
export function mountView(bridge: ViewBridge, root: HTMLElement, tool: string, doc: Doc = document) {
  let data: ViewData | undefined;
  let args: Record<string, unknown> = {};
  let busy = false;
  let error: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const draw = () => {
    if (data) root.innerHTML = renderView(data, { busy, ...(error ? { error } : {}) });
    else if (error) root.innerHTML = `<p class="error" role="alert">${esc(error)}</p><button type="button" data-action="refresh">Retry</button>`;
  };
  const schedule = () => {
    clearTimeout(timer);
    if (data) timer = setTimeout(() => void (doc.visibilityState === "hidden" ? schedule() : refresh()), data.pollSeconds * 1000);
  };
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    error = undefined;
    draw();
    try {
      await task();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    busy = false;
    draw();
    schedule();
  };
  const refresh = () =>
    run(async () => {
      data = toolData<ViewData>(await bridge.callTool(tool, args));
    });

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    const action = target?.dataset.action;
    if (action === "refresh") void refresh();
    const projectId = data && "projectId" in data ? data.projectId : undefined;
    if (!projectId) return;
    if (action === "approve")
      void run(async () => {
        toolData(await bridge.callTool("creator_video_approve", { projectId }));
        data = toolData<ViewData>(await bridge.callTool(tool, { ...args, projectId }));
      });
    if (action === "publish")
      void run(async () => {
        data = toolData<ViewData>(await bridge.callTool("creator_video_publish", { projectId }));
      });
  });

  root.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    if (select.dataset.role !== "project") return;
    args = { ...args, projectId: select.value };
    void refresh();
  });

  bridge.onToolInput = (input) => {
    args = input;
  };
  bridge.onToolResult = (result: CallToolResult) => {
    try {
      data = toolData<ViewData>(result);
      error = undefined;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    draw();
    schedule();
  };

  return { refresh, hasData: () => data !== undefined || error !== undefined };
}
