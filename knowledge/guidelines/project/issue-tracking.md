# GitHub Issue Tracking Guidelines

## Purpose
This document establishes consistent practices for GitHub Issues usage in the Credit Management Service project, ensuring clear task decomposition, progress tracking, and team coordination.

## Issue Hierarchy and Flow

### 1. Epic Creation (Analysis Stage)
**Purpose**: Capture big value units that deliver meaningful functionality

**Format**:
```
Title: Epic: [Epic Name]
Labels: epic
Milestone: [Release version]

Description:
## Goal
[What this epic achieves for users/business]

## Value
[Why this epic is important]

## Rough Checklist
- [ ] Sub-area 1 (will become Task)
- [ ] Sub-area 2 (will become Task) 
- [ ] Sub-area 3 (will become Task)

## Success Criteria
[How we know the epic is complete]

## Dependencies
[Other epics/external dependencies needed]
```

**Labels**: `epic`

### 2. Task Drafting (Planning Stage)
**Purpose**: Convert epic checklist items into detailed, actionable work items

**Format**:
```
Title: Task: [Specific Task Name]
Labels: task
Milestone: [Release version]
Related: Epic #[number]

Description:
## Context
[Background and why this task matters]

## Acceptance Criteria
- [ ] Specific requirement 1
- [ ] Specific requirement 2
- [ ] Specific requirement 3

## Implementation Checklist
- [ ] Subtask A (may become sub-issue)
- [ ] Subtask B (may become sub-issue)
- [ ] Testing and validation
- [ ] Documentation updates

## Definition of Done
[Clear criteria for task completion]
```

**Labels**: `task`

### 3. Subtask Refinement
**Decision Rules for Sub-Issues vs Checkboxes**:

**Promote to Sub-Issue When**:
- Requires different skill set or expertise
- Can be worked on in parallel with other subtasks
- Needs dedicated testing or validation
- Complex enough to warrant separate discussion
- Could be assigned to different team member

**Keep as Checkbox When**:
- Simple, sequential step in larger task
- Takes less than half day of work
- Doesn't require separate testing
- Part of atomic workflow

**Sub-Issue Format**:
```
Title: [Specific Implementation Detail]
Labels: subtask
Milestone: [Release version]
Parent: Task #[number]

Description:
## What
[Specific work to be done]

## Why
[Context from parent task]

## How
[Implementation approach if known]

## Acceptance
[Clear completion criteria]
```

### 4. Implementation Stage
**Process**:
1. Assign subtasks to team members/agents
2. Update issue status and comments to track progress
3. Create branches linked to issues (`feature/issue-123-description`)
4. Regular progress updates in issue comments
5. Close subtasks as completed → parent Task auto-tracks progress
6. Close Task when all subtasks complete → Epic auto-tracks progress

### 5. Milestone Mapping
**Milestone Structure**:
- `v0.1 - Foundation` - Infrastructure, deployment, basic health checks
- `v0.2 - Core Domain` - Business logic, database, core APIs
- `v0.3 - Admin Features` - Management interfaces, monitoring
- `v1.0 - Production Ready` - Full feature set, documentation, testing

**Assignment Rules**:
- **Epics**: Always assigned to milestone
- **Tasks**: Assigned to milestone (inherits from Epic)
- **Subtasks**: Optionally assigned to milestone for granular tracking
- **Bugs**: Assigned to milestone where fix is needed

## Label System

### Core Labels (Simplified)
| Label | Color | Description |
|-------|-------|-------------|
| `epic` | `#7057ff` | Big value units spanning multiple tasks |
| `task` | `#0075ca` | Main work items with clear deliverables |
| `subtask` | `#a2eeef` | Granular implementation work |
| `bug` | `#d73a49` | Issues discovered during development |

## Best Practices

### Issue Writing
- **Clear Titles**: Use active voice, be specific
- **Context First**: Always explain why before what
- **Acceptance Criteria**: Measurable, testable requirements
- **Link Dependencies**: Reference related issues explicitly
- **Regular Updates**: Comment on progress, blockers, discoveries

### Label Usage
- **One label per issue**: Use epic, task, subtask, or bug
- **Clear hierarchy**: Epic → Task → Subtask relationship
- **Progress via comments**: Use issue comments and status for progress tracking

### Branch Naming
- Format: `[type]/issue-[number]-[short-description]`
- Examples: 
  - `epic/issue-1-foundation-deployment`
  - `task/issue-5-effect-monorepo-setup`
  - `subtask/issue-12-jwt-middleware`

### Pull Request Integration
- Reference issues in PR description: `Closes #123`
- Link to parent task if PR closes subtask
- Include testing evidence in PR comments
- Request reviews from appropriate team members

## Issue Templates

### Epic Template
```markdown
## Goal
[What this epic achieves]

## Value  
[Why this epic matters]

## Rough Checklist
- [ ] [Major component 1]
- [ ] [Major component 2] 
- [ ] [Major component 3]

## Success Criteria
- [ ] [Measurable outcome 1]
- [ ] [Measurable outcome 2]

## Dependencies
[External dependencies or prerequisite epics]
```

### Task Template  
```markdown
## Context
[Background and motivation]

## Acceptance Criteria
- [ ] [Specific requirement 1]
- [ ] [Specific requirement 2]

## Implementation Notes
[Technical approach, constraints, considerations]

## Definition of Done
- [ ] Implementation complete
- [ ] Tests written and passing  
- [ ] Documentation updated
- [ ] Code reviewed and approved
```

### Subtask Template
```markdown
## What
[Specific work to be completed]

## Why
[Context from parent task]

## Acceptance
- [ ] [Clear completion criteria]

## Notes
[Implementation details, blockers, discoveries]
```

## Workflow Examples

### Example 1: Epic → Tasks → Subtasks
```
Epic #1: Foundation & Deployment (epic)
├── Task #2: Effect Monorepo Setup (task)  
│   ├── Subtask #3: Package.json Configuration (subtask)
│   └── Subtask #4: TypeScript Setup (subtask)
├── Task #5: Basic HTTP Server (task)
│   └── Subtask #6: Health Check Endpoint (subtask)
└── Task #7: Railway Deployment (task)
    ├── Subtask #8: Railway Configuration (subtask)
    └── Subtask #9: Environment Variables (subtask)
```

### Example 2: Bug Handling
```
Bug #15: JWT Middleware Returns 500 (bug)
├── Investigation reveals root cause
├── Create Task #16: Fix JWT Error Handling (task)
└── Both assigned to current milestone
```

This systematic approach ensures clear project tracking, smooth team coordination, and visible progress throughout development.