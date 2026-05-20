# Span Events Are Being Deprecated — Events Are Now Logs

Did you know OpenTelemetry actually had **two** overlapping ways to emit events correlated to a trace?

- **Span Events** — attached directly to a span
- **Log-based Events** — logs correlated to a span via context

This caused confusion, so the **Span Event API is being deprecated**. Going forward, events should be written as **logs correlated with the current span**.

> Existing tooling that renders events on spans will keep working during the transition — but new code should emit logs.

👉 [Deprecating Span Events API](https://opentelemetry.io/blog/2026/deprecating-span-events/)
