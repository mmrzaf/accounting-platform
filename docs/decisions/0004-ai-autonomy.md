# ADR-0004: AI can operate through authorized application commands

- **Status:** Accepted principle; detailed risk policy proposed
- **Date:** 2026-11-17

## Decision

AI is capable of routine financial operations, not just recommendations. The same typed commands, actor context, permissions, validation, posting, idempotency, and audits apply to UI and AI. Risk-based confirmation replaces an always-confirm rule; never allow model-originated journal writes or direct SQL. External model use is configurable and optional.

## Consequences

Fast user experience with nontrivial security and duplicate execution risks. Add deterministic command policies, prompt-injection defenses, explicit execution provenance and recovery from unknown completion status.
