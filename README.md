# Wisp — A Little Witch for Everyday Knowledge Work

**Turn a passage into understanding, a check, or a draft — then let a familiar carry the next task.**

Wisp is a browser-based AI workspace for creators and knowledge workers who need to make sense of scattered notes. Instead of starting every task in an empty chat box, users select text or open a document, summon a small action menu, and work with a result beside their material.

**AI Builder Cup theme alignment:** Future of Work & Enterprise Productivity.

| Resource | Link |
| --- | --- |
| Live demo | [Open Wisp]() |
| Demo video | [Watch the walkthrough]() |
| Presentation | [Read the deck / PDF]() |

<!-- Maintainers: insert the prepared public URLs into the three empty link destinations above. -->

## Try the live demo

**Try the live demo:** [Demo URL]()

Gemini is configured on the server; no API key is required from reviewers. Open a document, click **Spells**, choose an ability, and confirm the request. For familiar tasks, keep the browser tab open until the reply arrives.

This describes the hosted-demo experience. Developers running their own copy configure their own server credentials using the setup instructions below. The verification results in this README are local results, not evidence of a Cloud Run deployment test.

### A short walkthrough

1. Open **Bookstore event proposal**, or open your own material. Select a passage to narrow the scope, or use the current document.
2. Click **Spells** at the bottom of the workspace, then **Understand**.
3. Review the material preview. Optionally choose a brief summary and enter an additional instruction. Click **Run Gemini Understand**.
4. Read the summary and source evidence. Use **Copy result**, or close the result to return to work.
5. Open **Spells → Check** to inspect dates and consistency, or **Spells → Create** to produce a draft. Confirm the material before running either action.
6. For a delegated task, choose **Spells → Summon**, pick a familiar, enter an instruction, and click **Summon familiar**. When it finishes, open its task marker on the right to read the reply.

The six entry points use Gemini by default; there is no Local/Gemini selection step. Opening a panel or changing a familiar does not send a model request. Explicit confirmation is required.

You can also continue from a result using **Summon familiar again**. This reuses the original source copy rather than silently treating AI-generated output as source evidence. Direct results are available under **File → Run history**.

## The problem and intended impact

A creator preparing an event, a research note, or a piece of content often needs three different operations on the same material: understand it, check it, and turn it into something usable. Moving each operation into a separate conversation can make the source and the output harder to compare.

Wisp puts those operations around the material itself. Its intended benefit is fewer context switches and a clearer connection between a claim and its source. These are product hypotheses: we have not measured productivity gains or conducted a user-outcome study, and we do not claim a quantified improvement.

## What Gemini does

| Ability | Purpose | Result to inspect |
| --- | --- | --- |
| **Understand** | Summarize the confirmed material | Summary, key points, source evidence, and missing information |
| **Check** | Inspect logic and dates | Findings, explanations, source evidence, and suggestions for review |
| **Create** | Produce a draft from the material | Draft, source facts, creative assumptions, alternatives, and missing information |

| Familiar | Delegated ability | Current execution model |
| --- | --- | --- |
| **Scout Bat** | Check | One-time Gemini task and saved reply |
| **Page Sprite** | Understand | One-time Gemini task and saved reply |
| **Alchemy Imp** | Create | One-time Gemini task and saved reply |

Gemini performs the semantic work; the pixel-art interface makes the task state and result approachable. Familiars are task roles around the same three capabilities, not six separate models or an autonomous multi-agent system.

## How to evaluate Wisp

The following maps observable prototype behavior to the [official judging criteria](https://aibuildercup.com/themes.html). It is an evaluation guide, not a claim about an awarded score.

| Criterion | Weight | What to examine |
| --- | --- | --- |
| Technical Merit & Gen AI Implementation | 40% | Real Gemini-backed summaries, checks, and drafts; server-side credentials; structured result validation; frozen source copies; saved results and task replies |
| Problem Alignment & Impact | 25% | Whether a creator can move from source material to understanding, review, and a usable draft with fewer manual transfers |
| Innovation & Creativity | 25% | Selection-based actions, small result panels, and familiar delegation that preserves the original source context |
| User Experience & Solution Design | 10% | The Spells entry point, material confirmation, readable results, copy/close actions, and unread-to-read task replies |

The design combines a nostalgic pixel-art identity with explicit control over which material is sent. Its proposed differentiation is the interaction workflow; it does not claim that summarization or drafting alone is novel.

## Architecture and data flow

```text
Browser workspace (React + TypeScript)
  Select text / current document
           |
  Review frozen material and confirm
           |
Python FastAPI service
  Validate input and call Gemini using server credentials
           |
Gemini Interactions API
           |
  Validate structured output and source evidence
           |
Browser result panel / familiar reply
  Save locally in IndexedDB
```

- **Frontend:** React, TypeScript, Vite, Zustand, and IndexedDB.
- **Backend:** Python, FastAPI, Pydantic, and HTTPX.
- **AI transport:** Gemini Interactions API; the model identifier is server configuration, with no implicit default.
- **Google Cloud target:** Cloud Run hosting for the web/API service. The local launcher described below binds to localhost and is not a Cloud Run deployment command.
- **Storage:** Browser-local materials and saved results. There is no cross-device account synchronization in this flow.

The backend validates response structure and quoted source ranges. Validation helps reject malformed results; it does not prove semantic correctness. Generated results remain subject to human review and do not automatically overwrite the source.

Credentials stay on the server. Do not commit `.env` files, include keys in frontend variables such as `VITE_*`, or ship credentials in a public archive. Confirmed material and instructions are sent to Gemini; browser-local storage does not mean AI processing happens offline.

## Run your own copy on Windows

These instructions are for developers, not reviewers using the hosted demo. Install Git, Node.js with npm, and Python first. The local backend has been exercised with Python 3.11.

Open **Command Prompt (CMD)**. The example uses `C:\Projects\WISP`; choose an unused folder so an existing project is preserved.

```bat
git clone --branch feature-updates/ai-builder-cup https://github.com/Singeeeeeer/WISP.git "C:\Projects\WISP"
cd /d "C:\Projects\WISP\Wisp"
npm ci
py -3.11 -m venv "C:\Projects\WISP\Wisp\.venv"
"C:\Projects\WISP\Wisp\.venv\Scripts\python.exe" -m pip install -r "C:\Projects\WISP\Wisp\requirements.lock.txt"
```

Create your private configuration once. If `.env` already exists, keep it rather than overwriting it:

```bat
if not exist "C:\Projects\WISP\Wisp\.env" copy "C:\Projects\WISP\Wisp\.env.example" "C:\Projects\WISP\Wisp\.env"
notepad "C:\Projects\WISP\Wisp\.env"
```

In that file, set `GEMINI_API_KEY` to your own key and `GEMINI_MODEL` to a model available to your account. Keep both in the server configuration; do not paste the key into the UI or README. The example configuration also documents API version and timeout settings.

Build and start:

```bat
cd /d "C:\Projects\WISP\Wisp"
npm run build
"C:\Projects\WISP\Wisp\.venv\Scripts\python.exe" "C:\Projects\WISP\Wisp\launch.py" --port 15478 --config "C:\Projects\WISP\Wisp\.env"
```

Open `http://127.0.0.1:15478/` if the browser does not open automatically. Keep the terminal open while using Wisp; press **Ctrl+C** to stop. If the port is occupied, choose another free port with `--port` rather than terminating an unrelated service. Restart after changing server configuration.

Startup does not call a model. A missing configuration produces an error when an AI task is submitted; the prototype does not silently replace Gemini with local rules. Local processing implementations and old records are retained internally, but the six primary UI actions now use Gemini.

## Verification evidence

These results describe a specific development snapshot; they are not a live service status badge.

| Verification | Scope | Observed result |
| --- | --- | --- |
| Real Gemini exercise, October 18, 2026 | Understand, Check, Create, Scout Bat, Page Sprite, Alchemy Imp; one synthetic example per entry | Six requests, no retries, all HTTP 200; saved results survived reload; source text unchanged; familiar replies changed from unread to read |
| Offline frontend verification, October 19, 2026, implementation commit `c832ae2` | Unit tests | 287 tests across 40 files passed |
| Offline Gemini UI regression, same implementation | Mocked browser tests | 15 passed, including confirmation, saved-result handling, cancellation, continuation, and Gemini defaults |
| Production build, same implementation | TypeScript and Vite | Passed |
| Built local UI inspection, same implementation | Six confirmation entries | No execution-mode selector; no model request while opening panels or switching familiars |

The real-call sample took approximately 9–69 seconds per request. This is a small observed sample, not a latency guarantee. The real calls preceded the UI-default change; the subsequent change was verified offline without additional model requests.

Known content observations: English output was returned despite Chinese instructions because the current prompts explicitly request English. One Alchemy Imp draft also over-questioned an explicitly stated date. These are documented quality limitations, not transport failures.

To run the same categories of offline checks from `C:\Projects\WISP\Wisp`:

```bat
npm test
npm run build
npx playwright test --config playwright.gemini.config.ts
```

Browser tests require the browser configured in Playwright and the Python dependencies installed above. The dedicated Gemini configuration starts a separate backend without model credentials; test responses are mocked. The full legacy browser suite, including tests that assume a local-mode UI, was not rerun for the default-Gemini change.

## Current boundaries and next steps

- Wisp is currently a browser workspace, not a system-wide assistant that can read every desktop application.
- Familiar tasks depend on the page staying open. Refreshing or closing interrupts the flow; unfinished tasks do not automatically rerun.
- Cloud Tasks and OIDC worker authentication are not implemented in this branch. `/api/jobs` returns 501 and the health response reports `jobs_enabled: false`.
- Gemini results do not automatically trigger Watch invitations.
- Saved results belong to the current browser and origin. Clearing site data removes local records; changing the URL or port can present a different local workspace.
- Public-service scaling needs deployment-specific authentication, quota controls, and persistence. The current request cache and concurrency guard are process-local, not a distributed job system.

Future work includes durable background execution, evaluation with real creator workflows, and improved language control. These are planned directions, not claims about completed features.

## Repository guide

| Location | Responsibility |
| --- | --- |
| `Wisp/apps/web/src` | Workspace UI, abilities, familiars, and browser storage |
| `Wisp/apps/api/app` | API contracts, Gemini transport, and output validation |
| `Wisp/apps/web/tests` | Frontend and domain unit tests |
| `Wisp/apps/api/tests` | Backend tests |
| `Wisp/e2e` | Browser scenarios |
| `Wisp/.env.example` | Server configuration template without credentials |
| `Wisp/launch.py` | Local web/API launcher |

Competition references: [themes and judging criteria](https://aibuildercup.com/themes.html) · [submission FAQ](https://aibuildercup.com/Faqs.html).
