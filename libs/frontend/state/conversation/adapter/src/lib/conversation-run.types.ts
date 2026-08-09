/** Public lifecycle states returned for an owner-visible OpenCrane run. */
export enum ConversationRunLifecycleStates
{
	/** The immutable run snapshot was accepted. */
	Accepted = "accepted",
	/** The run is waiting for admission capacity. */
	Queued = "queued",
	/** The run has been assigned to an attempt. */
	Assigned = "assigned",
	/** The runtime is currently executing the run. */
	Running = "running",
	/** The run is blocked on a user approval. */
	WaitingForApproval = "waiting_for_approval",
	/** Cancellation has been requested. */
	Cancelling = "cancelling",
	/** The run completed successfully. */
	Completed = "completed",
	/** The run failed before completion. */
	Failed = "failed",
	/** The run was cancelled. */
	Cancelled = "cancelled"
}

/** Result categories for a run admission request. */
export enum ConversationRunAdmissionOutcomes
{
	/** A new immutable run snapshot was admitted. */
	Accepted = "accepted",
	/** A retry returned the already admitted run for the same idempotency key. */
	Idempotent = "idempotent",
	/** The run could not be admitted. */
	Failed = "failed"
}

/** Browser-safe failure categories for run admission. */
export enum ConversationRunAdmissionFailures
{
	/** The browser sent an invalid or stale request. */
	InvalidRequest = "invalid_request",
	/** The browser session is missing or expired. */
	AuthenticationRequired = "authentication_required",
	/** Required conversation, persona, membership, or dataset evidence was unavailable. */
	AdmissionEvidenceUnavailable = "admission_evidence_unavailable",
	/** OpenCrane admission capacity is temporarily full. */
	AdmissionCapacityFull = "admission_capacity_full",
	/** The admission authority is temporarily unavailable. */
	Unavailable = "unavailable",
	/** The generated client returned an unexpected failure. */
	Unknown = "unknown"
}

/** One client-generated admission attempt for a specific conversation thread. */
export interface ConversationRunAdmissionAttempt
{
	/** Existing canonical conversation thread id. */
	readonly threadId: string;
	/** Caller-generated key reused for safe transport retries. */
	readonly requestIdempotencyKey: string;
}

/** Result of admitting one run from an existing conversation thread. */
export interface ConversationRunAdmissionResult
{
	/** Admission outcome shown to the feature layer. */
	readonly outcome: ConversationRunAdmissionOutcomes;
	/** Canonical run identifier when admission succeeded or was idempotent. */
	readonly runId?: string;
	/** User-safe failure category when admission failed. */
	readonly failure?: ConversationRunAdmissionFailures;
	/** Whether the same attempt can be retried without changing the idempotency key. */
	readonly retryable: boolean;
}

/** Display-safe owner-visible run status. */
export interface ConversationRunStatusView
{
	/** Canonical run identifier. */
	readonly runId: string;
	/** Attempt number reported by the control plane. */
	readonly attempt: number;
	/** Public lifecycle state. */
	readonly state: ConversationRunLifecycleStates;
	/** Thread associated with the run, when interactive. */
	readonly threadId: string | null;
	/** Agent revision used by the immutable run snapshot. */
	readonly agentRevisionId: string;
	/** ISO-8601 admission timestamp. */
	readonly acceptedAt: string;
	/** ISO-8601 terminal timestamp, when terminal. */
	readonly finishedAt: string | null;
}

/** Owns run admission and status reads for conversation features. */
export interface ConversationRunGateway
{
	/**
	 * Create one stable attempt object for an existing conversation thread.
	 *
	 * @param threadId - Existing canonical conversation thread id.
	 * @returns A retryable run-admission attempt.
	 */
	createAdmissionAttempt(threadId: string): ConversationRunAdmissionAttempt;

	/**
	 * Admit one run using an existing attempt.
	 *
	 * @param attempt - The thread/idempotency tuple created by the gateway.
	 * @returns Browser-safe admission result.
	 */
	admitRun(attempt: ConversationRunAdmissionAttempt): Promise<ConversationRunAdmissionResult>;

	/**
	 * Read one owner-visible run lifecycle summary.
	 *
	 * @param runId - Canonical run identifier returned by admission.
	 * @returns Display-safe run status.
	 */
	getRunStatus(runId: string): Promise<ConversationRunStatusView>;
}
