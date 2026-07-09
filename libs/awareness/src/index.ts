/**
 * @opencrane/awareness — the awareness contract-version module.
 *
 * Org-context RETRIEVAL now lives in the official `@cognee/cognee-openclaw` OpenClaw plugin
 * (installed into each tenant pod), NOT in this package — the bespoke in-pod retrieval client,
 * citation builder, and golden-suite eval were removed when the plugin was adopted. What remains
 * is the awareness contract version the control-plane stamps onto the runtime contract and uses
 * for its rollout/canary machinery (see clustertenant-operator `core/awareness`).
 */
export { AWARENESS_CONTRACT_VERSION, ___AssertContractCompatible, ___IsContractCompatible } from "./contract-version.js";
