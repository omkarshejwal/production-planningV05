# Recent Changes

This document tracks the recent bug fixes and configuration updates made to the application.

## 1. `estimated_completion` Time Formatting Bug Fix
- **Issue**: The `handleSaveToDb` function contained a rounding bug where `Math.round(totalMins % 60)` could return `60` (e.g., when `totalMins % 60` was `59.5`). This generated invalid time strings like `"21:60"`, causing 422 validation errors from the backend.
- **Fix**: Moved the rounding logic to `totalMins` *before* decomposing it into hours and minutes, ensuring the minute value (`cm`) always strictly stays in the `0-59` range.
- **Files Touched**: `src/components/planning/ProductionPlanningPage.tsx`

## 2. Yield-Adjusted "Good Bottles" in Grid Qty Column
- **Issue**: The main planning grid's "Qty" column was showing the raw, unadjusted daily quantity, whereas users expected to see the 90% yield-adjusted "Good Bottles" amount (which was previously only visible inside the cell hover tooltip).
- **Fix**: Applied the `calcGoodBottles` utility (90% yield factor) to the raw quantity returned by `calculateQuantityForProductionDay` within the `getDailyProducedQty` wrapper. This aligns the grid column with the tooltip.
- **Files Touched**: `src/components/planning/ProductionPlanningPage.tsx`

## 3. GitHub Actions CI Deployment Fix
- **Issue**: The CI workflow was failing with a `permission denied: The requested installation does not exist` error when trying to push Docker images. This occurred because the repository was moved back to the `omkarshejwal` namespace.
- **Fix**: Updated the GitHub Container Registry (GHCR) tags in the CI workflow to push to `ghcr.io/omkarshejwal/...` instead of the old `vlr-spec` namespace.
- **Files Touched**: `.github/workflows/ci.yml`

## 4. Holiday Highlighting Logic
- **Issue**: The holiday cache was empty on the initial load of the planning grid, so holiday dates were not being highlighted correctly on the screen.
- **Fix**: Added a `useEffect` hook to fetch holiday data on component mount and store it in state, forcing the UI to highlight holiday dates properly upon initial load.
- **Files Touched**: `src/components/planning/ProductionPlanningPage.tsx`

## 5. Job Deletion 500 Error
- **Issue**: Deleting jobs threw a 500 Internal Server Error due to a Postgres type mismatch (`InvalidDatetimeFormat`).
- **Fix**: Parsed the `plan_date` and `start_time` string parameters into a proper Python `datetime` object before querying the database.
- **Files Touched**: `Backend/app/api/production/jobs.py`
