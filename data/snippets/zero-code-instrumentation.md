# Zero-Code Instrumentation Doesn't Touch Your Source Code At All

OTel's [zero-code (auto) instrumentation](https://opentelemetry.io/docs/concepts/instrumentation/zero-code/) works by injecting instrumentation **at runtime**:

- **Java** — bytecode manipulation via a Java agent
- **Python** — monkey-patching at import time
- **Go / C++** — `LD_PRELOAD` and eBPF techniques
- **Node.js / .NET** — module-loader hooks

Your application source code remains completely unchanged.

> This is how many **Dynatrace OneAgent** integrations work too — they hook into the runtime rather than requiring SDK calls in your business logic.

👉 [Zero-Code Instrumentation Docs](https://opentelemetry.io/docs/concepts/instrumentation/zero-code/)
