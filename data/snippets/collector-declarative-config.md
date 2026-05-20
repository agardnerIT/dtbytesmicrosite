# OTel Collector Has 200+ Components — and Declarative Config Is Now Stable

The OpenTelemetry Collector isn't just a forwarder — it has over **200 components**:

- Receivers
- Processors
- Exporters
- Connectors

And as of early 2026, **declarative configuration** is **stable**. That means defining the Collector pipeline in a structured YAML schema — rather than environment variables or code — is officially supported.

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
exporters:
  otlphttp:
    endpoint: https://your-backend/v1/traces
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlphttp]
```

> You can now manage Collector pipelines as **versioned, reviewable config files** with a stable spec.

👉 [Declarative Configuration is Stable!](https://opentelemetry.io/blog/2026/stable-declarative-config/)
