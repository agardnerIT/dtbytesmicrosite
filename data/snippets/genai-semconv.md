# GenAI Semantic Conventions: OTel Can Tell You Token Counts and Full Prompt Content

OpenTelemetry now has [Semantic Conventions for Generative AI](https://opentelemetry.io/blog/2026/genai-observability/).

These standardize how LLM operations are recorded, including:

- **Model name** and provider
- **Input and output token counts**
- **Tool invocations** and their arguments
- (When opted in) the **full content of prompts and completions**

> An OTel-instrumented AI agent can show you exactly **which tool call was slow**, **how many tokens each step consumed**, and **where retry loops occurred** — without any custom logging.

👉 [Inside the LLM Call: GenAI Observability with OpenTelemetry](https://opentelemetry.io/blog/2026/genai-observability/)
