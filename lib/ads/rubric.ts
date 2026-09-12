// Automated pause-ad gates. Any failure means regenerate or skip.
// G3 and G5 are regex-first — they trip more than you expect.

import type { ExpandedAd } from "@/lib/ads/types";

export type GateId =
  | "G1"
  | "G2"
  | "G3"
  | "G4"
  | "G5"
  | "G6"
  | "G7"
  | "G8"
  | "G9";

export type GateResult = {
  id: GateId;
  pass: boolean;
  detail: string;
};

export type RubricResult = {
  pass: boolean;
  gates: GateResult[];
  failures: GateId[];
};

const CAMERA_MOVE =
  /(?<![\w-])(?:cut(?:s|ting)? to|smash cut|zoom(?:s|ing|ed)? in|zoom(?:s|ing|ed)? out|pan(?:s|ning|ned)? across|dolly(?:ing)?|crane(?:s|ing)?|tilt(?:s|ing|ed)? (?:up|down)|tracking shot|whip pan|push[- ]?in|pull[- ]?out|orbit(?:s|ing)? (?:around|the)|aerial shot|drone shot|new angle|camera moves|we (?:then )?see|we cut)(?![\w-])/i;

const FORBIDDEN_TEXT =
  /\b(logo|wordmark|brand name|trademark|caption|lower[- ]?third|end card|on[- ]?screen text|subtitle|watermark|notification bar|app icon|ui text|nutrition (?:facts|panel)|swoosh)\b/i;

// Brand-ish / readable UI tells that expanders invent often.
const NUMERAL_UI =
  /\b(?:\d{1,2}:\d{2}(?::\d{2})?|\d+\s*%|\d+\s*(?:Mbps|GB|TB|fps))\b/;

const NEW_LOCATION =
  /\b(cut to|new (?:room|kitchen|bathroom|bedroom|studio|set|city|street|beach|office|gym)|establishing shot|different location|another room|walks? into a|arrives? at a|teleport)\b/i;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function firstWords(text: string, n: number): string {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

function checkG1(primary: string): GateResult {
  const head = firstWords(primary, 40).toLowerCase();
  const hasSpace =
    /\b(room|interior|exterior|street|kitchen|office|frame|scene|space|shot|setting|environment|desk|table|wall|window|floor|field|car|hallway)\b/.test(
      head,
    );
  const hasLight =
    /\b(light|lighting|lit|sun|daylight|warm|cool|shadow|key|ambient|exposure|practical|glow|specular)\b/.test(
      head,
    );
  const hasSubject =
    /\b(person|people|hand|face|figure|subject|man|woman|viewer|someone|body|wrist|arm)\b/.test(
      head,
    ) || hasSpace;
  const pass = hasSpace && hasLight && hasSubject;
  return {
    id: "G1",
    pass,
    detail: pass
      ? "Opening reads the frame"
      : "First 40 words lack concrete space/light/subject",
  };
}

function checkG2(primary: string, transition: string): GateResult {
  const hit =
    NEW_LOCATION.test(primary) || NEW_LOCATION.test(transition);
  return {
    id: "G2",
    pass: !hit,
    detail: hit
      ? "Prompt invents or cuts to a new location"
      : "Location locked",
  };
}

function checkG3(primary: string, transition: string): GateResult {
  const hit = CAMERA_MOVE.test(primary) || CAMERA_MOVE.test(transition);
  return {
    id: "G3",
    pass: !hit,
    detail: hit
      ? "Camera-move / cut language detected"
      : "Camera locked",
  };
}

function checkG4(primary: string): GateResult {
  // Heuristic: multiple explicit "then proves / also shows" chains.
  const proofs = primary.match(
    /\b(then (?:it )?(?:shows|proves|demonstrates)|also (?:shows|proves)|second (?:beat|demo|proof)|another (?:demo|proof))\b/gi,
  );
  const multi = (proofs?.length ?? 0) >= 2;
  const twice =
    /\b(two demonstrations|twice|second hero beat|another demonstration)\b/i.test(
      primary,
    );
  const pass = !multi && !twice;
  return {
    id: "G4",
    pass,
    detail: pass
      ? "Single demo beat"
      : "Multiple demonstration beats detected",
  };
}

function checkG5(primary: string, transition: string): GateResult {
  const text =
    FORBIDDEN_TEXT.test(primary) || FORBIDDEN_TEXT.test(transition);
  const nums = NUMERAL_UI.test(primary) || NUMERAL_UI.test(transition);
  const pass = !text && !nums;
  return {
    id: "G5",
    pass,
    detail: pass
      ? "No text/brand/UI tells"
      : "Brand/UI/numeral text language detected",
  };
}

function checkG6(primary: string): GateResult {
  const anchored =
    /\b(hand|wrist|palm|table|desk|counter|shelf|floor|lap|surface|ledge|windowsill|ground|case|bottle|on the|in the|rests? on|sits? on|held|holding)\b/i.test(
      primary,
    );
  const floating = /\b(floats?|hover(?:s|ing)|suspended in (?:mid)?air)\b/i.test(
    primary,
  );
  const pass = anchored && !floating;
  return {
    id: "G6",
    pass,
    detail: pass
      ? "Placement anchored"
      : "Product placement not anchored to frame affordance",
  };
}

function checkG7(transition: string): GateResult {
  const restores =
    /\b(return|restore|original|baseline|resume|opening frame|same (?:grade|light|focal|exposure|plane)|dissolves? back|as (?:it|they) (?:was|were))\b/i.test(
      transition,
    );
  return {
    id: "G7",
    pass: restores,
    detail: restores
      ? "Transition resolves to opening continuity"
      : "Transition does not clearly restore original grade/focus",
  };
}

function checkG8(expanded: ExpandedAd): GateResult {
  if (!expanded.safe_to_insert) {
    return {
      id: "G8",
      pass: false,
      detail: expanded.safety_reason || "safe_to_insert is false",
    };
  }
  return { id: "G8", pass: true, detail: "Safety gate clear" };
}

function checkG9(primary: string, transition: string): GateResult {
  const pw = wordCount(primary);
  const tw = wordCount(transition);
  const primaryOk = pw >= 220 && pw <= 420;
  const transitionOk = tw >= 90 && tw <= 180;
  const pass = primaryOk && transitionOk;
  return {
    id: "G9",
    pass,
    detail: pass
      ? `Length ok (primary ${pw}, transition ${tw})`
      : `Length fail (primary ${pw} want 220-420, transition ${tw} want 90-180)`,
  };
}

export function runPauseAdGates(expanded: ExpandedAd): RubricResult {
  const primary = expanded.primary_prompt || "";
  const transition = expanded.transition_prompt || "";

  const gates: GateResult[] = [
    checkG8(expanded),
    checkG1(primary),
    checkG2(primary, transition),
    checkG3(primary, transition),
    checkG4(primary),
    checkG5(primary, transition),
    checkG6(primary),
    checkG7(transition),
    checkG9(primary, transition),
  ];

  // If unsafe, other gates are moot but still reported.
  const failures = gates.filter((g) => !g.pass).map((g) => g.id);
  return {
    pass: failures.length === 0,
    gates,
    failures,
  };
}

/** Regex-only quick pass used in tests / logging. */
export function regexCameraAndTextPass(
  primary: string,
  transition: string,
): { g3: boolean; g5: boolean } {
  return {
    g3: !CAMERA_MOVE.test(primary) && !CAMERA_MOVE.test(transition),
    g5:
      !FORBIDDEN_TEXT.test(primary) &&
      !FORBIDDEN_TEXT.test(transition) &&
      !NUMERAL_UI.test(primary) &&
      !NUMERAL_UI.test(transition),
  };
}
