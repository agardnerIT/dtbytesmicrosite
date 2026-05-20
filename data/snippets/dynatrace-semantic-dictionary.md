# Dynatrace Has a "Semantic Dictionary" — A Curated Attribute Vocabulary

Dynatrace publishes a [Semantic Dictionary](https://docs.dynatrace.com/docs/semantic-dictionary) — a structured vocabulary of entities, attributes, and relationships used across the Dynatrace platform.

It:

- Aligns with (and extends) OTel Semantic Conventions
- Ensures data ingested via OTLP maps predictably to Dynatrace topology entities like **Services**, **Hosts**, and **Processes**
- Acts as a contract between your telemetry and Dynatrace's analytics

> This is how Dynatrace can **auto-correlate OTel spans into its Smartscape topology** without manual configuration.

👉 [Dynatrace Semantic Dictionary](https://docs.dynatrace.com/docs/semantic-dictionary)
