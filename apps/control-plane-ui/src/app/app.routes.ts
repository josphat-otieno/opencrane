import type { Routes } from "@angular/router";

import { authGuard } from "./core/auth/auth.guard";
import { AccessTokensPageComponent } from "./features/access-tokens/access-tokens-page.component";
import { AdminPanelPageComponent } from "./features/admin/admin-panel-page.component";
import { DashboardPageComponent } from "./features/dashboard/dashboard-page.component";
import { ProvisionPageComponent } from "./features/provision/provision-page.component";
import { ProviderKeysPageComponent } from "./features/provider-keys/provider-keys-page.component";
import { ServerStatsPageComponent } from "./features/server-stats/server-stats-page.component";
import { TenantDetailPageComponent } from "./features/tenant-detail/tenant-detail-page.component";
import { TokenUsagePageComponent } from "./features/token-usage/token-usage-page.component";

/** Application routes for feature pages. */
export const appRoutes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "dashboard" },
  { path: "dashboard", component: DashboardPageComponent, canActivate: [authGuard] },
  { path: "provision", component: ProvisionPageComponent, canActivate: [authGuard] },
  { path: "tenants/:name", component: TenantDetailPageComponent, canActivate: [authGuard] },
  { path: "admin", component: AdminPanelPageComponent, canActivate: [authGuard] },
  { path: "stats", component: ServerStatsPageComponent, canActivate: [authGuard] },
  { path: "usage", component: TokenUsagePageComponent, canActivate: [authGuard] },
  { path: "tokens", component: AccessTokensPageComponent, canActivate: [authGuard] },
  { path: "providers", component: ProviderKeysPageComponent, canActivate: [authGuard] },
];
