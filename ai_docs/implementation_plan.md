# Implementation Plan - Workplace Grounding & Placeholder Fix

The goal is to stop the AI from using `[Company]` placeholders and ensure that "workplace" questions are answered using "Professional Experience" data.

## Problem Analysis
1.  **Placeholder Usage**: The model is using `[Company]` either because it thinks it's a template or because it can't find a company name for the project it chose (since the project was a personal one, not a job).
2.  **Attribution Error**: The user asked about their "current workplace" (Center for Community Resilience), but the AI answered with a "Financial Risk Intelligence Platform" project (a personal project).

## Proposed Changes

### 1. Workplace Injection (`server/model_manager.py`)
-   Identify the current workplace: **Center for Community Resilience**.
-   Inject this as a "Core Fact" in the system prompt so the AI knows what "current workplace" refers to.

### 2. Prompt Refinement
-   **Company Name Enforcement**: Explicitly instruct the AI: "NEVER use [Company] placeholders. Use the actual name from the resume. If the resume says 'Center for Community Resilience', use that."
-   **Experience Prioritization**: Instruct the AI: "If asked about your 'workplace' or 'role', prioritize facts from the 'PROFESSIONAL EXPERIENCE' section. Only use 'PROJECTS' if explicitly asked about projects."
-   **Project Attribution**: "If using a personal project, refer to it as 'my [Project Name] project', not as a 'role at a company'."

### 3. Behavioral Training Suggestion
-   I will suggest the user creates a `stories.txt` file in `server/data/` with a few "Behind the scenes" STAR narratives to give the AI more "human" material to work with.

## Verification Plan
1.  **Test Question**: "Tell me about a success at your current workplace."
2.  **Success Criteria**: AI mentions "Center for Community Resilience" and a project *from that role* (e.g., Economic Data Analytics Platform). No `[Company]` placeholders.
