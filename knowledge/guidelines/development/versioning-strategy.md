# Versioning Strategy

## Overview

This document outlines the versioning strategy for the Credit Management Service monorepo, balancing simplicity with flexibility for both application releases and package management.

## Strategy: Application-Centric Versioning

We use an **Application-Centric** approach where:
- The server application drives the main release versioning
- Packages maintain independent semantic versioning
- Git tags represent application releases
- Environment variables provide build-time version injection

## Implementation

### Application Versioning

**Server Application (`apps/server`)**
- Uses git tags for version identification: `v1.2.3`, `v2.0.0`
- Version endpoint reads from `APP_VERSION` environment variable
- Fallbacks: `APP_VERSION` → `package.json.version` → `"0.0.0"`

**Version Detection Logic**
```bash
# Development
APP_VERSION=$(git describe --tags --exact-match 2>/dev/null || git describe --tags 2>/dev/null || echo 'dev-0.0.0')

# Production (Railway)
APP_VERSION=v1.2.3  # Set during deployment
```

### Package Versioning

**Independent Packages** (`packages/*`)
- Each package maintains its own semantic version
- Versioned independently based on changes
- Use standard `npm version` or tools like `changeset`

**Current Packages:**
- `@credit-system/rpc` - API contracts and schemas
- `@credit-system/shared` - Shared utilities
- `@credit-system/client` - API client
- `@credit-system/cli` - Command line interface
- `@credit-system/domain` - Domain logic

## Release Workflow

### Application Releases

1. **Prepare Release**
   ```bash
   # Ensure clean working tree
   git status
   
   # Update CHANGELOG if maintaining one
   # Run tests and build validation
   pnpm build && pnpm test
   ```

2. **Create Release Tag**
   ```bash
   # Create and push version tag
   git tag v1.2.3
   git push origin v1.2.3
   ```

3. **Deploy**
   - Railway automatically deploys on tag push
   - Sets `APP_VERSION=v1.2.3` during deployment
   - Version endpoint returns tagged version

### Package Releases

1. **Update Package Version**
   ```bash
   cd packages/rpc
   npm version patch  # or minor/major
   ```

2. **Publish** (if public packages)
   ```bash
   npm publish
   ```

## Version Endpoint Response

The `/version` endpoint provides comprehensive build information:

```json
{
  "version": "v1.2.3",           // From APP_VERSION or git tag
  "commit": "a1b2c3d",          // Git commit SHA (short)
  "buildTime": "2025-09-07T10:49:28.000Z",  // Build timestamp
  "nodeVersion": "v20.x.x",     // Node.js version
  "environment": "production"    // NODE_ENV
}
```

## Environment Variables

### Development
- `APP_VERSION`: Auto-detected from git tags
- `GIT_COMMIT_SHA`: Auto-detected from git
- `BUILD_TIME`: Generated at startup
- `NODE_ENV`: `development`

### Production (Railway)
- `APP_VERSION`: Set during deployment (e.g., `v1.2.3`)
- `RAILWAY_GIT_COMMIT_SHA`: Provided by Railway
- `BUILD_TIME`: Set during build process
- `NODE_ENV`: `production`

## Monorepo Considerations

### Advantages
- **Simple Releases**: Single version tag per application release
- **Clear Deployment**: Version directly maps to git tag
- **Package Flexibility**: Independent package versioning when needed
- **Build-Time Injection**: Clean, secure version detection

### Limitations
- **Shared Tags**: All git tags are monorepo-wide
- **Coordination**: Package dependencies must be managed
- **Release Frequency**: Application releases may not align with package changes

### Mitigation Strategies
- Use clear tag naming convention (`v1.2.3` for app releases)
- Consider package-specific tags if needed (`@pkg/name@1.0.0`)
- Automate dependency updates between packages
- Use workspace protocols for internal dependencies

## Best Practices

### Tag Management
- Use semantic versioning: `v1.2.3`
- Create annotated tags with release notes
- Never move or delete published tags
- Use pre-release tags for testing: `v1.2.3-beta.1`

### Build Scripts
- Always inject version info at build time, never runtime
- Use environment variables for configuration
- Provide sensible fallbacks for development
- Validate version format in CI/CD

### Documentation
- Maintain CHANGELOG.md for application releases
- Document breaking changes clearly
- Link releases to GitHub issues/PRs
- Update API documentation with version changes

## Future Enhancements

Consider these tools for advanced versioning:
- **Changesets**: Automated changelog and version management
- **Lerna**: Monorepo package versioning
- **Conventional Commits**: Automated version bumping
- **Release Please**: Google's release automation tool

## Examples

### Development Version
```json
{
  "version": "v0.1.0-2-g1a2b3c4",  // 2 commits after v0.1.0
  "commit": "1a2b3c4",
  "environment": "development"
}
```

### Production Release
```json
{
  "version": "v1.2.3",
  "commit": "a1b2c3d",
  "buildTime": "2025-09-07T10:00:00.000Z",
  "environment": "production"
}
```

### Pre-release
```json
{
  "version": "v1.3.0-beta.1",
  "commit": "x9y8z7w",
  "environment": "staging"
}
```