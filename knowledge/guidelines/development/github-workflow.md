# GitHub Workflow Guidelines

## Purpose

This document establishes standardized GitHub workflow practices for the Credit Management Service development, ensuring clean code integration, effective collaboration, and maintainable project history.

## Branch Strategy

### Core Principle: Feature Branch Workflow with Subtask Branches

```
main (production-ready code)
└── task-N-feature-name (feature branch)
    ├── task-N/subtask-1-name (subtask branch)
    ├── task-N/subtask-2-name (subtask branch)
    └── task-N/subtask-3-name (subtask branch)
```

### Branch Naming Conventions

- **Feature branches**: `task-{issue-number}-{short-description}`
  - Example: `task-3-http-server-health-checks`
- **Subtask branches**: `task-{parent-issue}/subtask-description`
  - Example: `task-3/fix-server-startup`, `task-3/add-version-endpoint`
- **Hotfix branches**: `hotfix-{description}`
- **Release branches**: `release-v{version}`

## Development Workflow

### 1. Feature Development Process

#### Step 1: Create Feature Branch
```bash
# Start from main
git checkout main
git pull origin main

# Create feature branch
git checkout -b task-3-http-server-health-checks
git push -u origin task-3-http-server-health-checks
```

#### Step 2: Break Down Into Subtasks
- Create GitHub issues for each logical subtask
- Identify dependencies between subtasks
- Plan execution order (blocking issues first)

#### Step 3: Develop Subtasks
```bash
# Create subtask branch from feature branch
git checkout task-3-http-server-health-checks
git checkout -b task-3/fix-server-startup

# Develop, commit, and push
git add .
git commit -m "Fix HTTP server startup issue

- Debug server binding problem
- Ensure health endpoint accessibility
- Add startup logging

Closes #6"
git push -u origin task-3/fix-server-startup
```

#### Step 4: Create Subtask Pull Request
- **Source**: `task-3/fix-server-startup`
- **Target**: `task-3-http-server-health-checks`
- **Title**: `Fix HTTP Server Startup (Issue #6)`
- **Description**: Link to issue, describe changes, mention testing

#### Step 5: Code Review and Merge
- Require at least one approval for subtask PRs
- Run automated tests and checks
- Merge using "Squash and merge" for clean history
- Delete subtask branch after merge

#### Step 6: Integration Testing
- Test integrated functionality on feature branch
- Ensure all subtasks work together correctly
- Address any integration issues

#### Step 7: Final Feature Pull Request
- **Source**: `task-3-http-server-health-checks`
- **Target**: `main`
- **Title**: `Task 3: Basic HTTP Server with Health Checks`
- **Description**: Comprehensive summary of all changes, closes parent issue

### 2. Subtask Dependencies Management

#### Sequential Dependencies
```bash
# Example: Issue #6 must be completed before #8
# 1. Complete and merge #6
# 2. Update feature branch
git checkout task-3-http-server-health-checks
git pull origin task-3-http-server-health-checks

# 3. Create dependent subtask branch
git checkout -b task-3/structured-logging
```

#### Parallel Development
```bash
# Independent subtasks can be developed simultaneously
git checkout task-3-http-server-health-checks

# Developer A works on version endpoint
git checkout -b task-3/add-version-endpoint

# Developer B works on configuration (in parallel)  
git checkout task-3-http-server-health-checks
git checkout -b task-3/environment-config
```

## Pull Request Guidelines

### Subtask Pull Requests

#### Title Format
`{Action} {Component} (Issue #{number})`

Examples:
- `Fix HTTP Server Startup (Issue #6)`
- `Add Version Endpoint with Build Info (Issue #7)`
- `Implement Structured Logging (Issue #8)`

#### Description Template
```markdown
## Changes
Brief description of what was implemented

## Issue
Closes #{issue-number}

## Testing
- [ ] Manual testing completed
- [ ] Automated tests added/updated
- [ ] Integration testing performed

## Notes
Any additional context or considerations
```

#### Review Requirements
- **Required reviewers**: At least 1 approval
- **Automated checks**: All CI tests must pass
- **Documentation**: Update relevant docs if needed
- **Dependencies**: Verify dependent issues are resolved

### Feature Pull Requests

#### Title Format
`Task {number}: {Feature Description}`

Example: `Task 3: Basic HTTP Server with Health Checks`

#### Description Template
```markdown
## Summary
Comprehensive description of the feature implementation

## Issues Resolved
- Closes #{parent-issue}
- Implements #{subtask-1}
- Implements #{subtask-2}
- ...

## Key Changes
- Component A: Description
- Component B: Description
- Configuration: Description

## Testing
- [ ] All acceptance criteria met
- [ ] Integration tests passing
- [ ] Manual verification completed
- [ ] Performance impact assessed

## Deployment Notes
Any special considerations for deployment
```

## Commit Message Standards

### Format
```
{type}: {short description}

{longer description if needed}

{footer with issue references}
```

### Types
- `feat`: New feature implementation
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring without functionality changes
- `test`: Adding or updating tests
- `chore`: Build tasks, dependency updates, etc.

### Examples
```bash
feat: implement version endpoint with build information

Add /version HTTP endpoint that returns:
- Package version from package.json
- Git commit SHA from environment
- Build timestamp and Node.js version
- Environment configuration

Closes #7

fix: resolve server startup hanging issue

- Fix Effect HTTP server Layer composition
- Ensure proper port binding and logging
- Add startup success confirmation

Closes #6
```

## Code Review Process

### Review Checklist

#### Technical Quality
- [ ] Code follows project conventions and style
- [ ] Error handling is comprehensive and appropriate
- [ ] Performance considerations addressed
- [ ] Security implications reviewed
- [ ] Tests provide adequate coverage

#### Integration
- [ ] Changes integrate cleanly with existing code
- [ ] No breaking changes to public APIs
- [ ] Documentation updated appropriately
- [ ] Configuration changes documented

#### Issue Resolution
- [ ] All acceptance criteria met
- [ ] Issue description accurately reflects implementation
- [ ] Related issues properly linked
- [ ] Follow-up tasks identified if needed

### Review Response Guidelines

#### For Authors
- Respond to feedback promptly and constructively
- Make requested changes in separate commits for easy review
- Ask questions when feedback is unclear
- Update PR description if scope changes

#### For Reviewers
- Provide specific, actionable feedback
- Distinguish between blocking issues and suggestions
- Acknowledge good practices and clean code
- Approve when requirements are met

## Conflict Resolution

### Merge Conflicts in Subtask Branches
```bash
# Update feature branch first
git checkout task-3-http-server-health-checks
git pull origin task-3-http-server-health-checks

# Rebase subtask branch
git checkout task-3/my-subtask
git rebase task-3-http-server-health-checks

# Resolve conflicts and continue
git add .
git rebase --continue
git push --force-with-lease origin task-3/my-subtask
```

### Integration Conflicts
- Test integration frequently by merging subtasks into feature branch
- Address conflicts at subtask level before final feature PR
- Use feature branch as integration point for testing

## Emergency Procedures

### Hotfix Process
```bash
# Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix-critical-security-fix

# Implement fix, test, and create PR directly to main
# After merge, ensure fix is integrated into active feature branches
```

### Rollback Process
```bash
# Revert specific subtask merge
git checkout task-3-http-server-health-checks
git revert -m 1 {merge-commit-hash}

# Or revert individual commits
git revert {commit-hash}
```

## Best Practices

### Development
1. **Keep branches focused** - One logical feature per branch
2. **Commit frequently** - Small, logical commits are easier to review
3. **Test before pushing** - Ensure code works locally
4. **Update dependencies carefully** - Test thoroughly after updates

### Collaboration  
1. **Communicate early** - Discuss approach before large changes
2. **Review promptly** - Don't block others' progress
3. **Share knowledge** - Document complex decisions and patterns
4. **Help teammates** - Offer assistance on challenging problems

### Maintenance
1. **Clean up branches** - Delete merged branches promptly
2. **Monitor CI/CD** - Fix failing builds quickly
3. **Update documentation** - Keep guidelines current with practices
4. **Regular retrospectives** - Improve workflow based on experience

## Tools and Automation

### GitHub Settings
- **Branch protection**: Require PR reviews for main and feature branches
- **Status checks**: All CI tests must pass before merge
- **Auto-merge**: Enable for approved subtask PRs
- **Branch cleanup**: Auto-delete merged branches

### CI/CD Integration
- Run tests on all PR branches
- Deploy feature branches to staging environments
- Automated dependency updates and security scanning
- Performance regression detection

This workflow ensures clean development practices, effective collaboration, and maintainable project history while supporting both individual and team development scenarios.