import { describe, expect, it } from "vitest";

import { WelcomeStep } from "../welcome.types";
import { _IsFirstStep, _IsLastStep, _NextStep, _PreviousStep, _StepIndex, _WELCOME_TOUR_CARDS } from "../welcome.util";

describe("step navigation", () =>
{
	it("orders steps Welcome→Workspace→Personalize→Tour→Finish", () =>
	{
		expect(_StepIndex(WelcomeStep.Welcome)).toBe(0);
		expect(_StepIndex(WelcomeStep.Workspace)).toBe(1);
		expect(_StepIndex(WelcomeStep.Personalize)).toBe(2);
		expect(_StepIndex(WelcomeStep.Tour)).toBe(3);
		expect(_StepIndex(WelcomeStep.Finish)).toBe(4);
	});

	it("advances forward and stops at the last step", () =>
	{
		expect(_NextStep(WelcomeStep.Welcome)).toBe(WelcomeStep.Workspace);
		expect(_NextStep(WelcomeStep.Tour)).toBe(WelcomeStep.Finish);
		expect(_NextStep(WelcomeStep.Finish)).toBe(WelcomeStep.Finish);
	});

	it("retreats backward and stops at the first step", () =>
	{
		expect(_PreviousStep(WelcomeStep.Workspace)).toBe(WelcomeStep.Welcome);
		expect(_PreviousStep(WelcomeStep.Welcome)).toBe(WelcomeStep.Welcome);
	});

	it("identifies the first step", () =>
	{
		expect(_IsFirstStep(WelcomeStep.Welcome)).toBe(true);
		expect(_IsFirstStep(WelcomeStep.Workspace)).toBe(false);
	});

	it("identifies the final step", () =>
	{
		expect(_IsLastStep(WelcomeStep.Finish)).toBe(true);
		expect(_IsLastStep(WelcomeStep.Tour)).toBe(false);
	});
});

describe("_WELCOME_TOUR_CARDS", () =>
{
	it("provides exactly three tour cards with unique ids", () =>
	{
		expect(_WELCOME_TOUR_CARDS.length).toBe(3);
		const ids = _WELCOME_TOUR_CARDS.map(function pickId(card) { return card.id; });
		expect(new Set(ids).size).toBe(3);
	});

	it("gives every card a title and a description", () =>
	{
		expect(_WELCOME_TOUR_CARDS.every(function isFilled(card) { return card.title.length > 0 && card.description.length > 0; })).toBe(true);
	});
});
