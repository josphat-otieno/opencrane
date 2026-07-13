/**
 * Shared Vitest setup for `libs/frontend/**` specs.
 *
 * Loads Angular's JIT compiler once per worker. Specs that instantiate Angular
 * DI graphs (e.g. anything reaching `@angular/router` -> `@angular/common`'s
 * `PlatformLocation`, or `TestBed`) need the JIT compiler available in the
 * framework-light Node test environment.
 */
import "@angular/compiler";
