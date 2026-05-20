# Kubernetes Semantic Conventions Just Reached Release Candidate

For years, Kubernetes attributes in OTel — like `k8s.pod.name` and `k8s.namespace.name` — were experimental.

In early 2026, they were **promoted to Release Candidate status** — the last step before stable.

This work focused specifically on attributes used by:

- The `k8sattributes` Collector processor
- The `resourcedetection` Collector processor

> Users can already try the new schema via **feature gates** before the final stable release, so you can validate dashboards and alerts ahead of time.

👉 [Kubernetes SemConv RC blog post](https://opentelemetry.io/blog/2026/k8s-semconv-rc/)
