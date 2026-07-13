import { PlanIdentity } from "@opencrane/core";

/**
 * Ordered steps of the self-serve signup funnel.
 *
 * Enum-first UI state: the page maps the current step to a heading, a panel,
 * and the stepper position with a `switch`/lookup rather than magic numbers.
 * Numeric values are 1-based so they double as the PrimeNG Stepper `value`.
 */
export enum OnboardingStep
{
	/** Choose a self-serve subscription plan. */
	Plan = 1,
	/** Capture organisation, admin email, base domain and cluster slug. */
	Account = 2,
	/** Redirect to Zitadel to register a new user session. */
	SignUp = 3,
	/** Collect payment against the (demo) payment gateway. */
	Payment = 4,
	/** Build the create body and provision the ClusterTenant. */
	Provision = 5,
	/** Watch provisioning advance to ready and hand off to the workspace. */
	Status = 6
}

/**
 * The customer/org details captured on the Account step.
 *
 * These map directly to a {@link PlanIdentity} plus the admin contact; real
 * OIDC sign-in will later populate the identity fields, leaving this shape
 * unchanged for the rest of the funnel.
 */
export interface OnboardingAccount
{
	/** Human-readable organisation/customer name (e.g. "Acme Corp"). */
	displayName: string;
	/** Administrator email for the new workspace. */
	adminEmail: string;
	/** Customer-owned base domain serving the tenant (e.g. "ai.acme-corp.com"). */
	baseDomain: string;
	/** DNS-safe cluster slug / resource name (e.g. "acme-corp"). */
	name: string;
}

/**
 * The funnel's accumulated selections across steps.
 *
 * Held as a single signal on the page so `computed` validity/derivation can read
 * a coherent snapshot; pure step logic lives in `onboarding.util.ts`.
 */
export interface OnboardingSelection
{
	/** Id of the chosen self-serve plan, or null until one is picked. */
	planId: string | null;
	/** The Account-step org/admin details. */
	account: OnboardingAccount;
}

/** Outcome of the (demo) payment phase, surfaced enum-first in the UI. */
export enum OnboardingPaymentState
{
	/** No checkout attempted yet. */
	Idle = "idle",
	/** Checkout created and/or confirmation in flight. */
	Processing = "processing",
	/** Payment confirmed; the subscription is active. */
	Paid = "paid",
	/** Checkout or confirmation failed; `message` carries the reason. */
	Failed = "failed"
}

/** Outcome of the provisioning phase, surfaced enum-first in the UI. */
export enum OnboardingProvisionState
{
	/** Provisioning not yet requested. */
	Idle = "idle",
	/** The create call is in flight. */
	Submitting = "submitting",
	/** The tenant was accepted by the control plane (now polling status). */
	Submitted = "submitted",
	/** The create call failed; `message` carries the reason. */
	Failed = "failed"
}

/**
 * Derive a {@link PlanIdentity} from the captured account details.
 *
 * Re-exported here as the funnel's canonical mapping point so the page never
 * hand-assembles identity fields; see `onboarding.util.ts` for the impl.
 */
export type OnboardingIdentity = PlanIdentity;
