# Railway Deployment Guide

Lean deployment instructions for the Credit Management Service on Railway.

## Prerequisites

- GitHub repository connected to Railway
- Railway CLI installed (optional)

## Service Setup

### 1. Create Railway Service

**Service Name**: `creditService`

1. **Create Railway Project**
   ```bash
   railway login
   railway init
   ```

2. **Connect GitHub Repository**
   - Link repository to Railway
   - Enable automatic deployments on `main` branch

### 2. Service Configuration

**Watch Paths** (set in Railway dashboard):
```
apps/server/**
packages/rpc/**
packages/shared/**
```

**Important**: Don't set Root Directory (breaks workspace dependencies)

## Environment Variables

Configure in Railway dashboard:

```bash
# Authentication
JWT_SECRET=your-jwt-secret

# Service Configuration
SERVICE_NAME=credit-system

# Multi-tenant Database URLs (add per merchant)
MERCHANT_ACME_DATABASE_URL=postgres://user:pass@host:5432/acme
MERCHANT_DEMO_DATABASE_URL=postgres://user:pass@host:5432/demo
```

## Deployment

### Automatic Deployment
Push to `main` branch triggers automatic deployment using `railway.json` configuration.

### Manual Deployment
```bash
railway deploy
```

## Health Monitoring

### Endpoints

**Health Check**: `https://your-railway-url.up.railway.app/health`
```json
{"status":"ok"}
```

**Version Info**: `https://your-railway-url.up.railway.app/version`
```json
{
  "version": "v0.1.0-18-ga166fe6",
  "commit": "a166fe6", 
  "buildTime": "2025-09-08T19:35:22.3NZ",
  "nodeVersion": "v20.x.x",
  "environment": "production"
}
```

## Background Jobs

Background jobs run via PostgreSQL `pg_cron` within merchant databases. No separate Railway service needed.

## Troubleshooting

### Build Issues
```bash
# Check build logs
railway logs --deployment

# Local testing
pnpm run build
pnpm run start:server
```

### Runtime Issues
```bash
# Check service logs
railway logs

# Verify environment variables
railway variables
```

## Deployment Checklist

- [ ] GitHub repository connected
- [ ] `creditService` created and configured  
- [ ] Environment variables set
- [ ] Watch paths configured
- [ ] Health endpoint responding (`/health`)
- [ ] Automatic deployments working

---

*Railway deployment configuration based on `knowledge/tech-solution/research/03_railway_deployment_config.md`*