import { describe, expect, it } from "vitest";
import { splitLead, splitQuestions } from "./findingText";

describe("splitLead", () => {
  it("keeps the first sentence and folds the rest", () => {
    const { lead, rest } = splitLead("Ibuprofen and Warfarin match the rule \"warfarin-nsaid\". NSAIDs inhibit platelets. Monitor INR.");
    expect(lead).toBe("Ibuprofen and Warfarin match the rule \"warfarin-nsaid\".");
    expect(rest).toBe("NSAIDs inhibit platelets. Monitor INR.");
  });
  it("does not split on abbreviations followed by lower-case or on a single sentence", () => {
    expect(splitLead("Take 1 tablet q8h. as needed for pain")).toEqual({ lead: "Take 1 tablet q8h. as needed for pain", rest: null });
    expect(splitLead("One sentence only.")).toEqual({ lead: "One sentence only.", rest: null });
  });
});

describe("splitQuestions", () => {
  it("shows at most three and folds the rest", () => {
    expect(splitQuestions(["a", "b", "c", "d", "e"])).toEqual({ visible: ["a", "b", "c"], folded: ["d", "e"] });
    expect(splitQuestions(["a"])).toEqual({ visible: ["a"], folded: [] });
  });
});
