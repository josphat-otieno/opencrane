import { WORKSPACE_ROUTES } from "../workspace.routes";
import { WorkspacePageComponent } from "../workspace-page.component";

describe("WORKSPACE_ROUTES", () =>
{
	it("mounts a shell with root home, tools, and settings features", () =>
	{
		const shell = WORKSPACE_ROUTES[0];

		expect(shell?.path).toBe("");
		expect(shell?.component).toBe(WorkspacePageComponent);
		expect(shell?.children?.map(function _path(route) { return route.path; })).toEqual(["", "conversation/:threadId", "tools", "settings"]);
	});

	it("does not restore retired conversation session routes", () =>
	{
		const childPaths = WORKSPACE_ROUTES[0]?.children?.map(function _path(route) { return route.path; });

		expect(childPaths).not.toContain("session/:id");
		expect(childPaths).not.toContain("session/:sessionId");
	});

	it("loads the conversation feature at the workspace root", async () =>
	{
		const rootRoute = WORKSPACE_ROUTES[0]?.children?.[0];
		const component = await rootRoute?.loadComponent?.();

		expect(component?.name).toBe("ConversationViewComponent");
	});

	it("loads opaque thread details through the conversation feature", async () =>
	{
		const detailRoute = WORKSPACE_ROUTES[0]?.children?.find(function _detail(route) { return route.path === "conversation/:threadId"; });
		const component = await detailRoute?.loadComponent?.();

		expect(component?.name).toBe("ConversationViewComponent");
	});
});
