# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in NovaFit, please report it responsibly.

**Do NOT open a public issue for security vulnerabilities.**

Instead, please report via GitHub Private Vulnerability Reporting:

1. Go to the [Security tab](https://github.com/kosiorkosa47/NovaFit/security) of this repository
2. Click "Report a vulnerability"
3. Provide a description of the vulnerability and steps to reproduce

You can expect an initial response within 48 hours.

## Security Considerations

- API keys and credentials must never be committed to the repository
- All API routes require authentication via NextAuth.js
- AWS Bedrock access is scoped to specific IAM roles
- Session data is stored with TTL expiration in DynamoDB
