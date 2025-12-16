# Hiring Signals Demo

This is a small AI demo about **how to use LLMs in subjective decisions**, using hiring review as an example.

It does not try to decide.  
It only helps people **see trade-offs more clearly**.

---

## Problem

Hiring decisions are:
- subjective
- high-risk
- low-data
- hard to measure

In this kind of problem, numbers often look precise but are not reliable.

This demo treats hiring as a **judgment problem**, not a scoring problem.

---

## What the model is allowed to do

The model can:
- give a coarse match level (Strong / Partial / Weak)
- explain the judgment in one short sentence
- list two main risks

The model cannot:
- give scores or probabilities
- estimate “potential”
- give advice or next steps

These limits are **intentional product choices**.

---

## Why no scores or “potential”

From a product perspective:

- Scores hide disagreement behind fake precision  
- “Potential” cannot be explained or reviewed later  
- Confident AI outputs push responsibility away from humans  
- In hiring, rejection is usually about **risk**, not lack of strength

Clear risks are more useful than confident answers.

---

## Output format

The system always returns only:

```json
{
  "match_level": "Strong | Partial | Weak",
  "rationale": "one short sentence",
  "risk_signals": ["risk 1", "risk 2"]
}
