import { InjectionToken } from "@angular/core";

import { StorageGateway } from "./storage.types";

/** DI token for a persistent storage gateway (e.g., localStorage). */
export const LOCAL_STORAGE_GATEWAY = new InjectionToken<StorageGateway>("LOCAL_STORAGE_GATEWAY");

/** DI token for a session-scoped storage gateway (e.g., sessionStorage). */
export const SESSION_STORAGE_GATEWAY = new InjectionToken<StorageGateway>("SESSION_STORAGE_GATEWAY");
