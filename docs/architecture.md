# Architecture

This document provides a high-level overview of the Codez GitHub Action architecture.

```mermaid
flowchart LR
  subgraph "GitHub Actions"
    A[GitHub Event<br/>(issue_comment, pull_request)] --> B[Action Runner]
  end

  subgraph "Core Orchestration"
    B --> C[Config Loader]
    B --> D[Model Verification]
    B --> E[Event Processor]
    E --> F[Permission Checker]
  end

  F -->|allowed| G[Action Executor<br/>(runAction)]
  F -->|denied| H[Exit Workflow]

  subgraph "Action Execution"
    G --> I[Clone Repository & Checkout]
    G --> J[Capture File State]
    G --> K[Prepare Prompt]
    K --> L[Codex CLI Client]
    L --> M[Raw AI Output]
    M --> N[Mask Sensitive Info]
    N --> O[Detect File Changes]
    O --> P[Handle Results]
  end

  subgraph "External Services"
    Q[OpenAI API]
    R[GitHub API]
  end

  C ----> Q
  G ----> R
  P ----> R
  P ---->|create PR, commit, comments, reactions| R
  P ---->|optionally create issues| S[GitHub Issues]
```

The flow starts with a GitHub event that triggers the Codez Action. The core orchestration in `main.ts` handles configuration, event processing, and permission checks before delegating to `runAction`. During action execution, the repository is cloned, context is gathered, and the Codex CLI is invoked to generate code edits. The AI output is processed, changes are detected and applied, and results are pushed back to GitHub via the GitHub API.
