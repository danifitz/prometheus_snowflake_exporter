# Snowflake account_usage Prometheus exporter

A Prometheus exporter for monitoring your Snowflake account using the built in ACCOUNT_USAGE schema.

# Prerequisites

- Docker
- [Snowflake account](https://signup.snowflake.com/)

# Usage

1. Build the docker image `docker build -t snowflake_prometheus:latest .`
2. `docker run -e CONFIG_YAML_PATH=./config.yaml -e SNOWFLAKE_ACCOUNT=account_string -e SNOWFLAKE_USERNAME=DANIELFITZGERALD -e SNOWFLAKE_PASSWORD=password -e SNOWFLAKE_ROLE=role your_repo:snowflake_prometheus:latest`

## Adding your own queries

1. Add a new section to `config.yaml` following this convention

```
- category: "the category - all metrics in this category will have the same prefix"
    help: Example
    labels:
    - 'LABEL1'
    - 'LABEL2'
    metrics:
    - key: the column name that will be used as the metric value
      name: the name of the metric
      type: gauge
    - key: the column name that will be used as the metric value
      name: the name of the metric
      type: gauge
    statement: >-
        sqlText
```

2. Based upon your SQL query, define which columns will be metrics and which will be labels applied to those metrics. Populate the labels section with a list of labels and the metrics section