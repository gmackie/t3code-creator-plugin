import { describe, expect, it } from "bun:test";

import { buildAnalyticsDiagnosis, buildCreatorWorkflow, buildNextActions, buildPackageChecklist, buildSurfaceModel, normalizeCreatorSnapshot } from "../creator.ts";
import { renderView } from "./render.ts";

const base = { channel: "GMACKO <b>", refreshedAt: "2026-11-13T00:00:00Z", pollSeconds: 60 };
const snapshot = normalizeCreatorSnapshot({
  channel: { name: "GMACKO" },
  ideas: [{ id: "i1", title: "<img src=x onerror=alert(1)>", rung: "spark" }],
  projects: [
    { id: "video-1", title: "Launch <script>", status: "editing", format: "long", package: { titleSelected: true, thumbnailSelected: false } },
    { id: "video-2", title: "Short", status: "ready", format: "short" },
  ],
  publishQueue: [{ id: "video-2", title: "Short", status: "ready" }],
  sponsors: [{ id: "deal-1", name: "Acme", status: "signed" }],
});

describe("view renderers", () => {
  it("renders the command center with escaped content and v1 destinations", () => {
    const html = renderView({ kind: "command-center", ...base, surface: buildSurfaceModel(snapshot), nextActions: buildNextActions(snapshot) });
    expect(html).toContain("GMACKO &lt;b&gt;");
    expect(html).toContain("Finish package for Launch &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Package review");
    expect(html).toContain("Sponsor deal room");
  });

  it("states missing analytics instead of inventing numbers", () => {
    const html = renderView({ kind: "analytics", ...base, metrics: { ctr: null }, diagnosis: buildAnalyticsDiagnosis({ ctr: null }) });
    expect(html).toContain('<div class="metric-value">—</div><div class="metric-label">CTR</div>');
    expect(html).toContain("More audience data needed");
  });

  it("renders empty states for each list", () => {
    expect(renderView({ kind: "publish-queue", ...base, items: [] })).toContain("The publish queue is empty.");
    expect(renderView({ kind: "content-calendar", ...base, slots: [] })).toContain("No calendar slots for this project.");
    expect(renderView({ kind: "sponsor-deal-room", ...base, totals: { active: 0, needsDisclosure: 0, delivered: 0 }, deals: [] })).toContain("No active sponsor deals.");
    expect(renderView({ kind: "package-review", ...base, projects: [], checks: [] })).toContain("No Creator projects yet.");
  });

  it("offers a project picker and the package checks", () => {
    const projects = snapshot.projects.map(({ id, title, status }) => ({ id, title, status }));
    const html = renderView({ kind: "package-review", ...base, projects, projectId: "video-1", projectTitle: "Launch <script>", checks: buildPackageChecklist(snapshot, "video-1") });
    expect(html).toContain('<option value="video-1" selected>');
    expect(html).toContain('pill-warning">attention');
  });

  it("offers approve, then publish, then reports the publish", () => {
    const projects = [{ id: "video-1", title: "Launch", status: "editing" }];
    const review = renderView({ kind: "video-readiness", ...base, projects, projectId: "video-1", projectTitle: "Launch", workflow: buildCreatorWorkflow(snapshot) });
    expect(review).toContain('data-action="approve"');
    const execute = renderView({ kind: "video-readiness", ...base, projects, projectId: "video-1", projectTitle: "Launch", workflow: buildCreatorWorkflow(snapshot, { approved: true }) }, { busy: true, error: "publish <failed>" });
    expect(execute).toContain('data-action="publish" disabled');
    expect(execute).toContain('role="alert">publish &lt;failed&gt;');
    const done = renderView({ kind: "video-readiness", ...base, projects, projectId: "video-1", projectTitle: "Launch", published: { status: "published" }, workflow: buildCreatorWorkflow(snapshot, { approved: true, published: true }) });
    expect(done).not.toContain('class="actions"');
    expect(done).toContain("Video published.");
  });
});
