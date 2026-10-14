# Logbook and history

## What counts as beating the logbook

Weighted rep-based entries use an Epley-derived score: **weight × (1 + reps / 30)**. The implementation compares an equivalent integer score using canonical micrograms to avoid unit-conversion rounding changing a result. This is a logbook comparison, not a tested maximum lift.

| Entry                     | Comparison                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Rest-pause                | One load and the sum of RP1 + RP2 + RP3                                                        |
| Straight sets             | Each matching set compared separately; at least one winning set makes the overall result a win |
| Body weight, Bar, or Band | Reps only, compared with the same load label                                                   |
| Timed hold                | Weight and duration together; conflicting directions require the user's decision               |

A weighted score must increase to win. A tied rep-based score does not beat the logbook. For example, 100 lb for 12 total reps scores 140; 105 lb for 11 scores 143.5 and wins despite fewer reps.

The first compatible appearance in a blast establishes a baseline. A load-type change also establishes a baseline. Previous performance is shared across rotation slots when the exercise, protocol, and set shape are compatible; changing protocol or set count can prevent a direct comparison. Earlier-blast data can guide load entry without triggering failure on the first appearance in the active blast.

## Mulligans and replacement

A failure offers **USE MULLIGAN** or **REPLACE EXERCISE**. If the next compatible appearance after a mulligan also fails, replacement is required. This follows the exercise across slots: a mulligan on B3 matters when the exercise next appears on B1. A win clears the mulligan state; it is not a single allowance for the entire blast.

For a timed hold with weight and duration moving in opposite directions, choose **COUNT AS WIN** or **COUNT AS FAILURE**. Choosing failure applies the same enforcement rules. Corrections and undo recalculate dependent baselines and failure state.

## Find and correct a performance

**HISTORY → EXERCISES** groups entries by body part and combines reused exercises with their slot labels. Search finds an exercise by name. Retired assignments remain available. Charts separate actual training segments, such as different blasts, protocols, set shapes, or load types.

**HISTORY → WORKOUTS** lists the active workout first, followed by completed workouts grouped by month. Open a workout or select a recent exercise performance to inspect its entries.

Where correction is enabled, select the saved performance, edit the load type, weight, reps, or duration, then select **SAVE CORRECTION**. **CANCEL** or Escape closes without saving. Entries tied to assignments in an active workout can be locked against historical correction; use the active workout's previous-exercise flow where available, or finish the workout first.

In **Settings**, LB/KG changes the display unit throughout the app. Saved canonical weights preserve comparison precision. If the preference fails to save, the current unit remains selected and **TRY AGAIN** is available.

Source: [comparison rules](https://github.com/mbh-solutions/dc_training/blob/main/src/workout-domain.ts), [history screen](https://github.com/mbh-solutions/dc_training/blob/main/src/HistoryScreen.tsx), [tests](https://github.com/mbh-solutions/dc_training/tree/main/tests).
