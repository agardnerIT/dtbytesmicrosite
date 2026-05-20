# Baggage Is NOT Automatically Added to Spans

[OTel Baggage](https://opentelemetry.io/docs/concepts/signals/baggage/) lets you propagate arbitrary key-value metadata across service boundaries — for example a `userId` or `tenantId`.

But here's the gotcha: **Baggage values are not automatically added as span attributes**.

If you want them in your traces, you must either:

- Explicitly read the baggage and set the attributes yourself
- Use a **Baggage Span Processor** to do it for you

> **Tip:** This surprises a lot of developers — assume nothing, and verify in your trace data that the attributes you expect are actually present.

👉 [OTel Baggage Docs](https://opentelemetry.io/docs/concepts/signals/baggage/)
