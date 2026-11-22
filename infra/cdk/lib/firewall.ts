import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import type * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

export interface ApiFirewallProps {
  loadBalancer: elbv2.IApplicationLoadBalancer;
}

/**
 * Requests one IP may send in 5 minutes before the firewall blocks it. The API's own limit is
 * 300/min per IP (1,500 per 5 min), answered with a friendly 429 in Redis. This sits at 2× that,
 * so it never touches a user the API would have served; it only stops floods before they reach
 * a container, use up Redis/DB, or make the API scale out for nothing.
 */
export const FIREWALL_RATE_LIMIT_PER_5_MIN = 3000;

const RATE_RULE = "rate-limit-per-ip";
const REPUTATION_RULE = "aws-ip-reputation";

/**
 * AWS WAF in front of the API's load balancer: the DDoS layer the API was missing (the web app
 * on Vercel has Vercel's own). AWS Shield Standard already absorbs network floods for free; WAF
 * adds the HTTP layer. Costs ~$7/month (web ACL + 2 rules) + $0.60 per million requests.
 * Its alarm lives with the others in lib/monitoring.ts.
 */
export class ApiFirewall extends Construct {
  readonly webAcl: wafv2.CfnWebACL;
  /** Requests the per-IP rule blocked, per 5 minutes. */
  readonly blockedByRateLimit: cloudwatch.Metric;

  constructor(scope: Construct, id: string, props: ApiFirewallProps) {
    super(scope, id);
    const stackName = cdk.Stack.of(this).stackName;
    const webAclName = `${stackName}-api`;
    const visibility = (metricName: string): wafv2.CfnWebACL.VisibilityConfigProperty => ({
      cloudWatchMetricsEnabled: true,
      metricName,
      // Keeps a sample of matched requests for 3 hours (WAF console): who was blocked and why.
      sampledRequestsEnabled: true,
    });

    this.webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: webAclName,
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: visibility(webAclName),
      rules: [
        {
          // IPs AWS has seen in botnets and attacks. Cheap to evaluate, no false positives
          // seen in practice for normal home/mobile users.
          name: REPUTATION_RULE,
          priority: 0,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesAmazonIpReputationList",
            },
          },
          visibilityConfig: visibility(REPUTATION_RULE),
        },
        {
          // The client's IP as the ALB sees it (no proxy in front, so no X-Forwarded-For).
          name: RATE_RULE,
          priority: 1,
          action: { block: { customResponse: { responseCode: 429 } } },
          statement: {
            rateBasedStatement: {
              limit: FIREWALL_RATE_LIMIT_PER_5_MIN,
              aggregateKeyType: "IP",
              evaluationWindowSec: 300,
            },
          },
          visibilityConfig: visibility(RATE_RULE),
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, "Association", {
      resourceArn: props.loadBalancer.loadBalancerArn,
      webAclArn: this.webAcl.attrArn,
    });

    this.blockedByRateLimit = new cloudwatch.Metric({
      namespace: "AWS/WAFV2",
      metricName: "BlockedRequests",
      dimensionsMap: { WebACL: webAclName, Rule: RATE_RULE, Region: cdk.Stack.of(this).region },
      statistic: "Sum",
      period: cdk.Duration.minutes(5),
    });
  }
}
