# Treatbot Git Commit Message Template

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Types

| Type | Description |
|------|-------------|
| **feat** | A new feature |
| **fix** | A bug fix |
| **docs** | Documentation only changes |
| **style** | Changes that do not affect the meaning of the code (white-space, formatting, etc) |
| **refactor** | A code change that neither fixes a bug nor adds a feature |
| **perf** | A code change that improves performance |
| **test** | Adding missing tests or correcting existing tests |
| **chore** | Changes to the build process or auxiliary tools and libraries |
| **ci** | Changes to CI configuration files and scripts |
| **build** | Changes that affect the build system or external dependencies |

## Scopes

| Scope | Description |
|-------|-------------|
| **api** | Backend API changes |
| **weapp** | WeChat Mini Program |
| **db** | Database related |
| **ui** | User interface |
| **auth** | Authentication |
| **deploy** | Deployment related |
| **docs** | Documentation |
| **test** | Testing |
| **config** | Configuration |

## Examples

### Feature
```
feat(api): add trial search endpoint

- Implement keyword search
- Add multi-dimensional filtering
- Support pagination

Closes #123
```

### Bug Fix
```
fix(auth): resolve token expiration issue

Token was not refreshing correctly after 24 hours.
Now properly extends expiration on refresh.

Fixes #456
```

### Documentation
```
docs(readme): update deployment instructions

- Add Docker deployment steps
- Update environment variables
- Add troubleshooting section
```

### Performance
```
perf(db): add indexes for medical records

Added indexes on user_id and created_at columns
for faster queries.

Improves query performance by 60%.
```

### Refactor
```
refactor(api): extract validation middleware

Moved validation logic from controllers to
dedicated middleware for better code organization.
```

## Best Practices

1. **Use present tense**: "add feature" not "added feature"
2. **Use imperative mood**: "move cursor to..." not "moves cursor to..."
3. **Limit first line to 72 characters**
4. **Reference issues and PRs liberally**
5. **Be specific in the body**

## Commit Checklist

- [ ] Type is correct
- [ ] Scope is specified
- [ ] Subject is clear and concise
- [ ] Body explains the "why" and "what"
- [ ] Footer references issues if applicable
