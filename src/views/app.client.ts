import { createViewBridge, type HostContext } from "./bridge.ts";
import { mountView } from "./controller.ts";

const root = document.getElementById("app")!;
const bridge = createViewBridge(window as never, { name: `creator-${root.dataset.view}`, version: "0.2.0" });
let context: HostContext = {};
// host-context-changed may carry only the changed fields, so merge them.
bridge.onHostContext = (update) => {
  context = { ...context, ...update };
  if (context.theme) document.documentElement.dataset.theme = context.theme;
};
new ResizeObserver(() => bridge.sendSize(document.documentElement.scrollWidth, document.documentElement.scrollHeight)).observe(document.body);

const view = mountView(bridge, root, root.dataset.tool!);
// A panel's opening tool result normally arrives right after initialize; if
// the host only loaded the resource, fetch the data ourselves.
void bridge.connect().then(() => setTimeout(() => void (view.hasData() ? undefined : view.refresh()), 250));
