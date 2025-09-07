# Development Guidelines Index

## Purpose

This directory contains development workflow guidelines, practices, and procedures for the Credit Management Service project. These guidelines ensure consistent development practices, effective collaboration, and maintainable code quality.

## Guidelines Overview

### [GitHub Workflow](./github-workflow.md)
Comprehensive GitHub workflow practices including:
- **Branch Strategy** - Feature branches with subtask branches
- **Pull Request Process** - Review requirements and merge procedures  
- **Commit Standards** - Message formatting and conventions
- **Code Review** - Quality checklist and response guidelines
- **Conflict Resolution** - Handling merge conflicts and integration issues
- **Emergency Procedures** - Hotfix and rollback processes

**Key Principles:**
- Feature branch workflow with subtask branches for complex tasks
- Each GitHub issue maps to a branch and pull request
- Sequential execution for dependent subtasks, parallel for independent ones
- Clean integration testing on feature branches before main merge

### [Versioning Strategy](./versioning-strategy.md)
Application-centric versioning approach for monorepo management:
- **Application Releases** - Git tags drive server application versioning
- **Package Management** - Independent semantic versioning for packages
- **Build-Time Injection** - Environment variables for version metadata
- **Production Deployment** - Railway integration with version detection
- **Version Endpoint** - `/version` API with comprehensive build information

**Key Features:**
- Clean git tag-based versioning (`v1.2.3`)
- No runtime git commands - build-time injection only
- Fallback strategies for development and production
- Independent package versioning when needed

## Development Workflow Summary

```
main
└── task-N-feature-name (feature branch)
    ├── task-N/subtask-1 (blocking subtask)
    ├── task-N/subtask-2 (parallel subtask)  
    └── task-N/subtask-3 (dependent subtask)
```

**Process Flow:**
1. Create feature branch from main for each major task
2. Break complex tasks into subtask issues and branches
3. Develop subtasks with focused pull requests to feature branch
4. Integration test on feature branch as subtasks are merged
5. Final pull request from feature branch to main

## Usage

These guidelines should be followed for all development work on the Credit Management Service. They are designed to work effectively for:

- **Individual development** - Clear structure and practices for solo work
- **Team collaboration** - Coordination and review processes for multiple developers
- **Complex features** - Breaking down large tasks into manageable subtasks
- **Integration testing** - Ensuring components work together correctly
- **Quality assurance** - Code review and testing requirements

## Updates and Evolution

These guidelines are living documents that should be updated based on:
- Project experience and lessons learned
- Team feedback and retrospectives  
- Tool changes and new capabilities
- Industry best practice evolution

All guideline changes should be discussed with the team and documented with rationale for future reference.