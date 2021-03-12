const express = require('express')
const YAML = require('yaml')
const snowflake = require('./snowflake');
const fs = require('fs');

const {
    SNOWFLAKE_ACCOUNT,
    SNOWFLAKE_USERNAME,
    SNOWFLAKE_PASSWORD,
    SNOWFLAKE_ROLE,
    CONFIG_YAML_PATH
} = process.env;

if (!SNOWFLAKE_ACCOUNT) throw new Error('Missing environment variable SNOWFLAKE_ACCOUNT');
if (!SNOWFLAKE_USERNAME) throw new Error('Missing environment variable SNOWFLAKE_USERNAME');
if (!SNOWFLAKE_PASSWORD) throw new Error('Missing environment variable SNOWFLAKE_PASSWORD');
if (!SNOWFLAKE_ROLE) throw new Error('Missing environment variable SNOWFLAKE_ROLE');
if (!CONFIG_YAML_PATH) throw new Error('Missing environment variable CONFIG_YAML_PATH');

const app = express()
const port = 3000
const prometheus = require('prom-client');

//set some default labels to be included on every metric
const defaultLabels = {
    account: SNOWFLAKE_ACCOUNT
};
prometheus.register.setDefaultLabels(defaultLabels);

const config = YAML.parse(fs.readFileSync(CONFIG_YAML_PATH).toString());
const metricPrefix = config.snowflake.config.prefix;

// Warn about ACCOUNTADMIN role usage
if (SNOWFLAKE_ROLE.toLowerCase() == 'accountadmin') {
    console.log(`SNOWFLAKE_ROLE is ACCOUNTADMIN, refer to: https://docs.snowflake.com/en/user-guide/security-access-control-considerations.html#control-the-assignment-of-the-accountadmin-role-to-users and consider using a custom role instead.`)
}

app.get('/healthz', (_, res) => {
    return res.sendStatus(200);
});

app.get('/metrics', (req, res) => {
    console.log('Being scraped');
    prometheus.register.metrics().then(metrics => {
        return res.send(metrics)
    }).catch(err => {
        return res.send(err);
    })
});

function getLabelValues(labels, obj) {
    let labelVals = {};
    // console.log('labels', labels, 'obj', obj);
    for (let i in labels) {
        // console.log(`label: ${i}`, labels[i]);
        if (obj.hasOwnProperty(labels[i])) {
            labelVals[labels[i]] = obj[labels[i]]
        } else {
            throw new Error('cannot find label in config that matches label in query result');
        }
    }
    return labelVals;
}

function getMetricValues(queryResult, metricDefinition) {
    console.log('queryResult', queryResult, 'metrics', metricDefinition);
}

function getFullyQualifiedMetricName(metricPrefix, category, metricName) {
    return `${metricPrefix}_${category}_${metricName}`;
}

function getMetricNameFromFullyQualifiedMetricName(metricPrefix, category, fullyQualifiedMetricName) {
    return fullyQualifiedMetricName.split(`${metricPrefix}_${category}_`)[1];
}

const gauges = config.snowflake.config.metrics.map(metric => {
    const {
        category,
        help,
        labels,
        metrics
    } = metric;
    
    for (let i in metrics) {
        const metricName = getFullyQualifiedMetricName(metricPrefix, category, metrics[i].name);
        // console.log('creating new Gauge metric with name:', metricName);

        let gauge = {};
        // console.log(labels);
        if(typeof labels !== 'undefined') {
            // console.log('creating metric with labels')
            // console.log(metrics[i], labels);
            // console.log('typeof labels',typeof labels);
            gauge = new prometheus.Gauge({
                name: metricName,
                help: help,
                labelNames: labels
            });
        } else {
            // console.log('creating metric without labels')
            // console.log(metrics[i], labels);
            // console.log('typeof labels',typeof labels);
            // console.log(metricName, help)
            gauge = new prometheus.Gauge({
                name: metricName,
                help: help
            });
        }
        return gauge;
    }
})

;
(async () => {
    app.listen(port, () => {
        console.log(`Snowflake exporter listening at http://localhost:${port}`)
    });

    const snow = snowflake(SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD, SNOWFLAKE_ROLE);

    // console.log(config.snowflake.config.metrics);

    // const metricPrefix = config.snowflake.config.prefix;
    const fetchInterval = config.snowflake.config.default_fetch_interval;
    console.log(`Fetch interval set at ${fetchInterval}`);
    
    // let gauges = [];

    const metricPromises = config.snowflake.config.metrics.map(async metric => {
        const {
            category,
            help,
            labels,
            metrics,
            statement
        } = metric;

        // console.log(`Processing category: ${category}`)

        // for (let i in metrics) {
        //     const metricName = getFullyQualifiedMetricName(metricPrefix, category, metrics[i].name);
        //     console.log('creating new Gauge metric with name:', metricName);

        //     let gauge = {};
        //     console.log(labels);
        //     if(typeof labels !== 'undefined') {
        //         console.log('creating metric with labels')
        //         console.log(metrics[i], labels);
        //         console.log('typeof labels',typeof labels);
        //         gauge = new prometheus.Gauge({
        //             name: metricName,
        //             help: help,
        //             labelNames: labels
        //         });
        //     } else {
        //         console.log('creating metric without labels')
        //         console.log(metrics[i], labels);
        //         console.log('typeof labels',typeof labels);
        //         console.log(metricName, help)
        //         gauge = new prometheus.Gauge({
        //             name: metricName,
        //             help: help
        //         });
        //     }
        //     gauges.push(gauge);
        // }

        const statements = Array.isArray(statement) ? statement : [statement];

        while (true) {
            // console.log('statements', statements);
            const rows = await snow.query(statements);
            
            if (rows.length > 0) {
                console.info(`Got ${rows.length} rows executing statement ${statements}`);
                rows.forEach((val) => {

                    for (let m in metrics) {
                        for (let g in gauges) {
                            if (getMetricNameFromFullyQualifiedMetricName(metricPrefix, category, gauges[g].name) == metrics[m].name) {
                                if (val.hasOwnProperty(metrics[m].key.toUpperCase())) {
                                    const metricValue = val[metrics[m].key.toUpperCase()];

                                    // some metrics don't have labels
                                    if(typeof labels !== 'undefined') {
                                        let labelValues = getLabelValues(labels, val);
                                        // console.log('got label values', labelValues);

                                        console.log(`Setting metric: ${metrics[m].name} with labels: ${JSON.stringify(labelValues)} and value: ${metricValue}`);

                                        gauges[g].set(labelValues, metricValue);
                                    } else {
                                        console.log(`Setting metric: ${metrics[m].name} with value: ${metricValue}`);
                                        gauges[g].set(metricValue);
                                    }
                                } else {
                                    throw new Error(`cannot find metric key: ${metrics[m].key} in query result for ${category}, check your config to make sure these match`)
                                }
                            }
                        }
                    }
                })
            } else {
                console.log(`Did not create metric for ${category}, no rows returned from SQL statement`);
            }
            await new Promise((resolve) => setTimeout(resolve, fetchInterval * 1000));
        }
    });
    await Promise.all(metricPromises);
})();