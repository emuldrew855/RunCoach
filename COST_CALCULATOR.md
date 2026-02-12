# Azure Cost Calculator for RunCoach

Detailed cost breakdown and optimization strategies for different usage scenarios.

---

## Base Configuration (Recommended Starter)

| Service | Tier | Specs | Monthly Cost |
|---------|------|-------|--------------|
| **Static Web Apps** | Free | 100 GB bandwidth | **$0** |
| **App Service** | Basic B1 | 1.75 GB RAM, 1 vCPU | **$13.14** |
| **PostgreSQL** | Burstable B1ms | 1 vCore, 2 GB RAM, 32 GB storage | **$12.41** |
| **Application Insights** | Basic | 5 GB data/month | **$0** |
| **OpenAI API** | Pay-per-use | ~1,000 messages/month | **$5-10** |
| **TOTAL** | | | **~$30-35/month** |

**Suitable for:** 100-500 users, 10-20 concurrent connections

---

## Usage-Based Cost Scaling

### OpenAI API Costs (Most Variable)

| Model | Cost per 1M Tokens | Typical Request | Cost per Request | 1000 Requests |
|-------|-------------------|-----------------|------------------|---------------|
| **GPT-4o** | Input: $5, Output: $15 | 1000 in / 500 out | $0.0125 | **$12.50** |
| **GPT-4o-mini** | Input: $0.15, Output: $0.60 | 1000 in / 500 out | $0.00045 | **$0.45** |

**Recommendation:** Use GPT-4o-mini for most queries, reserve GPT-4o for complex analysis.

**Cost Optimization:**
- Implement prompt caching (50% cost reduction)
- Limit context window to necessary data
- Use streaming to reduce token usage

**Projected OpenAI Costs:**
| Monthly Users | Messages/User | Monthly Cost |
|--------------|---------------|--------------|
| 50 | 20 | **$5** |
| 100 | 20 | **$10** |
| 500 | 20 | **$50** |
| 1000 | 20 | **$100** |

---

## Scaling Scenarios

### Scenario 1: MVP (0-100 users)

**Configuration:**
- Static Web Apps: Free tier
- App Service: Basic B1
- PostgreSQL: Burstable B1ms
- OpenAI: ~500 queries/month

**Monthly Cost:** **$25-30**

---

### Scenario 2: Growth (100-500 users)

**Configuration:**
- Static Web Apps: Standard ($9/month for custom domains)
- App Service: Basic B2 (3.5 GB RAM, 2 vCPU) - $26/month
- PostgreSQL: Burstable B2s (2 vCore, 4 GB RAM) - $25/month
- OpenAI: ~2,000 queries/month

**Monthly Cost:** **$70-80**

**When to upgrade:**
- Backend CPU >70% consistently
- Database queries >100ms average
- >200 concurrent users

---

### Scenario 3: Established (500-2000 users)

**Configuration:**
- Static Web Apps: Standard with CDN
- App Service: Standard S1 (1.75 GB RAM, 1 vCPU, auto-scale) - $70/month
- PostgreSQL: General Purpose GP_Gen5_2 (2 vCore, 10 GB RAM) - $120/month
- OpenAI: ~10,000 queries/month

**Monthly Cost:** **$250-300**

**Benefits:**
- Auto-scaling to handle traffic spikes
- 99.95% SLA
- Deployment slots for staging
- Better performance (50-100ms response times)

---

## Cost Optimization Strategies

### 1. Reserved Instances (30-40% savings)

Purchase 1-year or 3-year reserved capacity:

| Service | 1-Year Savings | 3-Year Savings |
|---------|----------------|----------------|
| App Service B1 | ~30% ($3.94/month) | ~40% ($5.25/month) |
| PostgreSQL B1ms | ~35% ($4.35/month) | ~45% ($5.59/month) |

**Total Savings:** ~$8-11/month ($96-132/year)

**When to buy:** After 3 months of consistent usage

---

### 2. Auto-Shutdown for Dev/Staging

For non-production environments:

```powershell
# Stop resources during off-hours (8 PM - 8 AM, weekends)
# Saves ~12 hours/day = 50% cost reduction
```

**Savings:** ~$15/month for dev environment

---

### 3. Database Storage Optimization

**Default:** 32 GB storage
**Actual usage:** ~2-5 GB for first 1000 users

```powershell
# Monitor storage usage
az postgres flexible-server show \
  --resource-group runcoach-prod \
  --name <server-name> \
  --query "storage.storageSizeGB"
```

**Optimization:** Start with 32 GB, scale up as needed (not down)

---

### 4. CDN Caching

Enable Azure CDN for Static Web App:

- **Cost:** $0.081/GB for first 10 TB
- **Savings:** Reduces backend load by 60-80%
- **Performance:** 200ms → 50ms average load time

---

### 5. OpenAI Prompt Optimization

**Current average:** 1500 tokens per request
**Optimized average:** 800 tokens per request
**Savings:** 47% reduction in OpenAI costs

**Techniques:**
- Remove unnecessary context from system prompts
- Implement conversation summarization
- Use function calling instead of full-text responses
- Cache common queries

---

## Cost Monitoring

### Set Up Budget Alerts

```powershell
# Create $50/month budget with alerts at 80% and 100%
az consumption budget create \
  --budget-name "RunCoach Monthly Budget" \
  --amount 50 \
  --time-grain Monthly \
  --resource-group runcoach-prod \
  --category Cost
```

### Daily Cost Tracking

View costs in Azure Portal:
1. Go to **Cost Management + Billing**
2. Click **Cost analysis**
3. Group by: **Service name**
4. Time: **Last 30 days**

### Cost Breakdown by Service (Expected)

```
PostgreSQL:        40%  ($12)
App Service:       35%  ($10)
OpenAI API:        20%  ($6)
Static Web Apps:   5%   ($1.50)
Misc (bandwidth):  <1%  ($0.50)
```

---

## Red Flags (Investigate Immediately)

| Alert | Action Required |
|-------|----------------|
| OpenAI costs >$50/month | Check for prompt loops or excessive token usage |
| Database CPU >90% | Optimize queries or upgrade tier |
| App Service crashes | Increase memory or fix memory leaks |
| Bandwidth >100 GB/month | Enable CDN caching |
| Storage >50 GB | Review database backups and logs |

---

## Cost Comparison: Azure vs Alternatives

### Azure (Current Plan)
**Monthly:** $30-35
- Managed services
- Auto-scaling
- Enterprise-grade security
- 99.9% SLA

### AWS (Equivalent)
**Monthly:** $35-40
- EC2 t3.small ($15)
- RDS PostgreSQL db.t3.small ($20)
- CloudFront CDN ($5)

### DigitalOcean (Budget Option)
**Monthly:** $20-25
- Droplet 2 GB ($12)
- Managed PostgreSQL ($15)
- No CDN
- 99.5% SLA
- More manual setup

### Heroku (Simplest)
**Monthly:** $50-60
- Eco Dynos ($5)
- Standard Postgres ($50)
- Extremely simple but expensive

**Verdict:** Azure offers best balance of cost, features, and scalability.

---

## Future Scaling Costs (Projections)

| User Count | Monthly Cost | Notes |
|------------|--------------|-------|
| 100 | $30 | Starter tier (current recommendation) |
| 500 | $80 | Need upgrade to B2/S1 |
| 1,000 | $150 | Auto-scaling enabled |
| 5,000 | $400 | Standard tier, CDN required |
| 10,000 | $800 | Premium tier, multiple regions |
| 50,000+ | $2,000+ | Enterprise setup, dedicated resources |

**Revenue Model Suggestion:**
- Free tier: Up to 50 messages/month
- Premium: $5/month (unlimited messages)
- Pro: $15/month (advanced features)

**Break-even:** ~100 premium users ($500/month revenue = $150 costs + profit)

---

## Cost Optimization Checklist

- [ ] Start with Basic tier (B1/B1ms)
- [ ] Enable Application Insights to monitor usage
- [ ] Set up budget alerts at $50/month
- [ ] Use Free tier for Static Web Apps
- [ ] Implement prompt caching for OpenAI
- [ ] Monitor database query performance
- [ ] Review costs weekly for first month
- [ ] Consider reserved instances after 3 months
- [ ] Enable auto-scaling before Black Friday sales
- [ ] Set up dev/staging auto-shutdown

---

## Questions?

**How much will 1000 users cost?**
~$150-200/month depending on usage patterns

**Can I start for free?**
Yes! Use Azure free credits ($200) for first 30 days

**What's the cheapest production setup?**
~$30/month (Basic B1 + Burstable B1ms + Free static hosting)

**When should I upgrade?**
When CPU >70% consistently or response times >500ms

**How to reduce OpenAI costs?**
Use GPT-4o-mini, implement caching, optimize prompts
