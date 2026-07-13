// Public API of @opencrane/elements/a2ui — in-process A2UI (Google A2UI protocol, Apache-2.0)
// rendering for agent-authored canvas surfaces, on the v0.8 dialect OpenClaw ships at the pin.
//
// This is the SINK half of the canvas feature (renderer + return path). The PRODUCER — the
// extractor that turns an agent A2UI/canvas message part into a `Canvas` MessageCard
// (`canvasMessages`) — lands with the live-pod transport verification (opencrane #28), since the
// gateway's canvas transport + the `canvas.action` return RPC can't be confirmed behind the local
// OIDC wall. Until then the Canvas card + `<wo-a2ui-canvas>` are wired but intentionally unproduced.
export * from "./lib/a2ui.providers";
export * from "./lib/a2ui-canvas.component";
export * from "./lib/a2ui-message.util";
