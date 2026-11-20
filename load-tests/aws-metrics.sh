#!/usr/bin/env bash
# Pulls the server-side numbers for a load-test window from CloudWatch (docs/load-testing.md):
# per-minute ECS CPU for API and worker, healthy API tasks (ALB targets), RDS CPU + connections, and ALB
# requests + p95 target response time. Prints a Markdown table.
#
#   load-tests/aws-metrics.sh 2026-11-20T00:30:00Z 2026-11-20T00:40:00Z
#
# Reads resource names from the SpeakUp-LoadTest stack. Needs the AWS CLI (signed in).
set -euo pipefail
START="$1"
END="$2"
STACK="${STACK:-SpeakUp-LoadTest}"
AWS="${AWS_CLI:-aws}"
R=(--region us-east-1)

res() {
  "$AWS" cloudformation describe-stack-resources "${R[@]}" --stack-name "$STACK" \
    --query "StackResources[?ResourceType=='$1'].PhysicalResourceId" --output text | head -1
}
CLUSTER=$(res "AWS::ECS::Cluster")
DB=$(res "AWS::RDS::DBInstance")
ALB=$(res "AWS::ElasticLoadBalancingV2::LoadBalancer" | sed 's|.*:loadbalancer/||')
TG=$(res "AWS::ElasticLoadBalancingV2::TargetGroup" | sed 's|.*:||')
SERVICES=$("$AWS" ecs list-services "${R[@]}" --cluster "$CLUSTER" --query serviceArns --output text |
  tr '\t' '\n' | sed 's|.*/||')
API=$(echo "$SERVICES" | grep ApiService)
WORKER=$(echo "$SERVICES" | grep WorkerService)

# One query per metric: namespace|metric|dimensions|stat
query() {
  local id=$1 ns=$2 metric=$3 dims=$4 stat=$5
  printf '{"Id":"%s","MetricStat":{"Metric":{"Namespace":"%s","MetricName":"%s","Dimensions":%s},"Period":60,"Stat":"%s"}}' \
    "$id" "$ns" "$metric" "$dims" "$stat"
}
ecs() { printf '[{"Name":"ClusterName","Value":"%s"},{"Name":"ServiceName","Value":"%s"}]' "$CLUSTER" "$1"; }
QUERIES="[$(query apicpu AWS/ECS CPUUtilization "$(ecs "$API")" Average),\
$(query workercpu AWS/ECS CPUUtilization "$(ecs "$WORKER")" Average),\
$(query apitasks AWS/ApplicationELB HealthyHostCount "[{\"Name\":\"LoadBalancer\",\"Value\":\"$ALB\"},{\"Name\":\"TargetGroup\",\"Value\":\"$TG\"}]" Maximum),\
$(query dbcpu AWS/RDS CPUUtilization "[{\"Name\":\"DBInstanceIdentifier\",\"Value\":\"$DB\"}]" Average),\
$(query dbconn AWS/RDS DatabaseConnections "[{\"Name\":\"DBInstanceIdentifier\",\"Value\":\"$DB\"}]" Maximum),\
$(query albreq AWS/ApplicationELB RequestCount "[{\"Name\":\"LoadBalancer\",\"Value\":\"$ALB\"}]" Sum),\
$(query albp95 AWS/ApplicationELB TargetResponseTime "[{\"Name\":\"LoadBalancer\",\"Value\":\"$ALB\"}]" p95)]"

"$AWS" cloudwatch get-metric-data "${R[@]}" --start-time "$START" --end-time "$END" \
  --metric-data-queries "$QUERIES" --output json |
  node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const byId = Object.fromEntries(JSON.parse(s).MetricDataResults.map((r) => [r.Id,
        Object.fromEntries(r.Timestamps.map((t, i) => [t, r.Values[i]]))]));
      const times = [...new Set(Object.values(byId).flatMap((m) => Object.keys(m)))].sort();
      const f = (v, d = 0) => (v === undefined ? "–" : v.toFixed(d));
      console.log("| time (local) | API CPU % | API tasks | worker CPU % | RDS CPU % | RDS conns | ALB req/s | ALB p95 ms |");
      console.log("|---|---|---|---|---|---|---|---|");
      for (const t of times) {
        const g = (id) => byId[id]?.[t];
        console.log(`| ${t.slice(11, 16)} | ${f(g("apicpu"))} | ${f(g("apitasks"))} | ${f(g("workercpu"))} | ` +
          `${f(g("dbcpu"))} | ${f(g("dbconn"))} | ${f(g("albreq") === undefined ? undefined : g("albreq") / 60, 1)} | ` +
          `${f(g("albp95") === undefined ? undefined : g("albp95") * 1000)} |`);
      }
    });'
