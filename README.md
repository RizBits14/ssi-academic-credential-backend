<p align="right">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# SSI Academic Credential Backend

A production-oriented **NestJS backend prototype for self-sovereign identity (SSI)-style academic credential issuance, holder-controlled disclosure, and bank recruitment verification**.

The system models a workflow in which a university issues a signed academic credential to a holder, the holder stores the credential in an encrypted wallet, a bank requests only the academic claims required for a job application, the holder approves those claims, and the bank verifies the resulting presentation before using the verified academic data in recruitment.

> **Important scope note**
>
> This project is an SSI-style academic credential verification prototype. It uses **mock DIDs** and **application-level selective disclosure**. It does not claim to implement a production decentralized identity network or standards such as OpenID4VCI, SD-JWT VC, or BBS+ selective disclosure.

---

## Table of Contents

- [Project Status](#project-status)
- [What the System Does](#what-the-system-does)
- [Main Workflow](#main-workflow)
- [Technology Stack](#technology-stack)
- [User Roles](#user-roles)
- [Core Features](#core-features)
- [Security Features](#security-features)
- [High-Level Architecture](#high-level-architecture)
- [Core Data Model](#core-data-model)
- [Prerequisites](#prerequisites)
- [Local Installation](#local-installation)
- [Environment Configuration](#environment-configuration)
- [PostgreSQL Setup](#postgresql-setup)
- [Redis Setup](#redis-setup)
- [Database Initialization](#database-initialization)
- [Database Cleanup and Reset](#database-cleanup-and-reset)
- [Running the Application Locally](#running-the-application-locally)
- [Local URLs](#local-urls)
- [Demo Accounts](#demo-accounts)
- [Authentication](#authentication)
- [API Response Format](#api-response-format)
- [Major API Endpoints](#major-api-endpoints)
- [Pagination and Filtering](#pagination-and-filtering)
- [Credential Lifecycle](#credential-lifecycle)
- [Verification Request Lifecycle](#verification-request-lifecycle)
- [Credential Verification Pipeline](#credential-verification-pipeline)
- [Audit Logging](#audit-logging)
- [Postman API Documentation](#postman-api-documentation)
- [Swagger / OpenAPI](#swagger--openapi)
- [Testing](#testing)
- [Project Scripts](#project-scripts)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Security and Secret Management](#security-and-secret-management)
- [Production Considerations](#production-considerations)
- [Known Prototype Limitations](#known-prototype-limitations)
- [Final Verification Checklist](#final-verification-checklist)

---

# Project Status

The backend implementation is complete for the current project scope.

Current verification status:

| Verification layer | Result |
|---|---:|
| TypeScript build | Passed |
| ESLint | Passed |
| Prettier check | Passed |
| Unit tests | **84 / 84 passed** |
| Unit test suites | **23 / 23 passed** |
| Automated E2E/security tests | **7 / 7 passed** |
| Manual Postman API requests | **56 / 56 passed** |
| Swagger/OpenAPI | Available |
| GitHub Actions CI | Configured |

The manual Postman run covers the complete API workflow from smoke testing and authentication through issuance, wallet access, recruitment, holder approval, verification, lifecycle operations, audit logs, and negative/security scenarios.

---

# What the System Does

The backend supports four main actors:

1. **System Administrator**
   - Maintains the trusted issuer registry.
   - Reviews system-wide audit logs.

2. **University / Issuer Administrator**
   - Creates academic records.
   - Defines credential schemas.
   - Issues academic credentials.
   - Suspends, reactivates, or revokes credentials.

3. **Credential Holder / Applicant**
   - Owns an encrypted academic credential.
   - Views credentials in a personal wallet.
   - Applies for jobs.
   - Reviews bank verification requests.
   - Approves only requested claims.
   - Creates holder-signed presentations.

4. **Bank / Verifier Administrator**
   - Creates recruitment jobs.
   - Requests academic claims from applicants.
   - Verifies credential presentations.
   - Uses verified academic claims in the recruitment process.

The objective is to demonstrate a complete trusted credential flow without requiring the applicant to repeatedly upload an academic certificate to every employer.

---

# Main Workflow

```text
University
   |
   |  Create academic record
   |  Create/select credential schema
   |  Issue signed credential
   v
Holder Wallet
   |
   |  Credential encrypted at rest
   |  Holder applies for a bank job
   v
Bank / Verifier
   |
   |  Requests only required academic claims
   v
Holder
   |
   |  Reviews requested claims
   |  Approves selected claims
   |  Creates holder-signed presentation
   v
Bank / Verification Engine
   |
   |  Validate request + nonce
   |  Validate holder proof
   |  Validate credential integrity
   |  Validate issuer signature
   |  Check trusted issuer registry
   |  Check credential status
   |  Check requested/disclosed claims
   v
Verified Job Application
```

A simplified end-to-end sequence is:

```text
Login
  -> Academic Record
  -> Credential Schema
  -> Credential Issuance
  -> Encrypted Wallet
  -> Job
  -> Application
  -> Verification Request
  -> Holder Approval
  -> Presentation
  -> Verification
  -> Verified Application Data
```

---

# Technology Stack

| Category | Technology |
|---|---|
| Backend framework | NestJS 11 |
| Language | TypeScript |
| Runtime | Node.js 24 |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| PostgreSQL adapter | `@prisma/adapter-pg` |
| Cache/session store | Redis |
| Redis client | ioredis |
| Authentication | JWT access + refresh tokens |
| Password hashing | Argon2 |
| Credential signatures | Ed25519 |
| Encryption | AES-256-GCM |
| Hashing | SHA-256 |
| API documentation | Swagger / OpenAPI |
| Manual API documentation | Postman |
| Logging | Pino / nestjs-pino |
| Validation | class-validator / class-transformer |
| Rate limiting | `@nestjs/throttler` |
| Security headers | Helmet |
| Unit testing | Jest |
| E2E testing | Jest + Supertest |
| CI | GitHub Actions |

---

# User Roles

The application uses role-based access control.

| Role | Main responsibility |
|---|---|
| `SYSTEM_ADMIN` | Trust registry and system administration |
| `ISSUER_ADMIN` | University academic records and credential management |
| `VERIFIER_ADMIN` | Bank recruitment and credential verification |
| `HOLDER` | Wallet ownership, job applications, and disclosure approval |

Authorization is enforced both by role and, where required, by organization ownership.

For example:

- An issuer administrator can only access records belonging to their university.
- A verifier administrator can only access applications belonging to jobs owned by their bank.
- A holder can only access their own wallet credentials and applications.

---

# Core Features

## Authentication

- Holder registration.
- Email/password login.
- Access JWT generation.
- Refresh JWT generation.
- Refresh-token rotation.
- Refresh-token replay prevention.
- Authenticated user endpoint.
- Logout and refresh-token revocation.

## Organization-aware authorization

- University organization membership.
- Bank organization membership.
- Role guards.
- Organization-scoped resource access.

## Mock DID infrastructure

DID examples:

```text
did:mock:university:<uuid>
did:mock:bank:<uuid>
did:mock:holder:<uuid>
```

The system stores DID public information and encrypted private-key material.

## Academic records

University administrators can:

- create academic records;
- list their university records;
- retrieve individual records;
- update academic information.

## Credential schemas

University administrators can create reusable academic credential schemas.

## Credential issuance

Credential issuance includes:

- academic record lookup;
- credential schema lookup;
- issuer DID resolution;
- holder DID resolution;
- VC-style credential construction;
- Ed25519 issuer signature;
- SHA-256 credential integrity hash;
- encrypted holder-wallet storage;
- initial status history;
- audit logging.

Credential issuance is transactionally persisted.

## Holder wallet

The holder can:

- list wallet credentials;
- filter wallet credentials;
- decrypt and view a credential they own;
- view pending credential verification requests.

## Recruitment workflow

Banks can:

- create jobs;
- define required credential claims;
- update jobs;
- inspect applications;
- request specific academic claims.

## Holder-controlled disclosure

The bank cannot arbitrarily request unrelated claims.

The holder explicitly approves claims before a presentation is created.

The implementation uses **application-level selective disclosure**, meaning the service constructs a presentation containing only the approved credential fields.

## Credential verification

Verification checks multiple independent conditions before accepting academic claims.

## Credential lifecycle

Supported statuses include:

```text
ACTIVE
SUSPENDED
REVOKED
EXPIRED
```

## Trust registry

The system administrator can:

- add a university issuer;
- list trusted issuers;
- resolve a trusted issuer by DID;
- suspend a trusted issuer.

## Audit logs

Security-sensitive and business-critical actions are recorded in structured audit logs.

## Pagination and filtering

Major list endpoints support pagination and relevant filters.

## Standard API envelopes

Most successful and error responses follow a consistent structure.

---

# Security Features

The backend includes the following security controls.

### Password protection

Passwords are hashed with **Argon2** and are never stored in plaintext.

### JWT authentication

- short-lived access tokens;
- refresh tokens;
- refresh-token hashing;
- refresh-token rotation;
- refresh replay protection;
- explicit logout/revocation.

### Encryption

Sensitive wallet/private-key material uses **AES-256-GCM** encryption.

### Digital signatures

Academic credentials and holder presentations use **Ed25519** signatures.

### Integrity protection

Credential integrity is protected using a deterministic representation and SHA-256 hashing.

### Authorization

- JWT guard;
- role guard;
- organization ownership checks;
- holder resource ownership checks.

### Trusted issuers

A valid signature alone is not sufficient. Verification also checks whether the issuer is currently trusted.

### Credential status

A credential can fail verification if it is:

- suspended;
- revoked;
- expired.

### Nonce and replay protection

Redis-backed verification sessions are short-lived and one-time.

Replay of a previously verified presentation is rejected.

### Request claim restrictions

Banks request claims according to job requirements, and the holder's approved claims must remain a subset of the requested claims.

### API hardening

The application also uses:

- Helmet;
- configurable CORS;
- global input validation;
- request body size limits;
- rate limiting;
- request IDs;
- structured logs;
- sensitive-field log redaction.

### Security scenarios explicitly tested

The automated and manual test suites include scenarios for:

- missing authentication;
- incorrect role access;
- invalid credentials;
- tampered disclosed CGPA;
- revoked credentials;
- untrusted issuers;
- presentation replay.

---

# High-Level Architecture

```mermaid
flowchart LR
    C[Client / Postman / Frontend] --> API[NestJS REST API]

    API --> AUTH[Authentication & RBAC]
    API --> ISSUER[Academic Records / Credential Issuance]
    API --> WALLET[Holder Wallet]
    API --> RECRUIT[Jobs / Applications]
    API --> VERIFY[Verification Engine]
    API --> TRUST[Trust Registry]
    API --> AUDIT[Audit Logging]

    AUTH --> DB[(PostgreSQL)]
    ISSUER --> DB
    WALLET --> DB
    RECRUIT --> DB
    VERIFY --> DB
    TRUST --> DB
    AUDIT --> DB

    AUTH --> REDIS[(Redis)]
    VERIFY --> REDIS

    ISSUER --> CRYPTO[Crypto Services]
    WALLET --> CRYPTO
    VERIFY --> CRYPTO

    CRYPTO --> ED[Ed25519]
    CRYPTO --> AES[AES-256-GCM]
    CRYPTO --> SHA[SHA-256]
```

---

# Core Data Model

Important database entities include:

| Model | Purpose |
|---|---|
| `User` | User account and role |
| `Organization` | University or bank |
| `OrganizationMember` | User-to-organization membership |
| `Did` | DID and encrypted key material |
| `AcademicRecord` | University academic source data |
| `CredentialSchema` | Credential structure definition |
| `Credential` | Issued credential metadata |
| `WalletCredential` | Encrypted credential stored for holder |
| `CredentialStatusHistory` | Credential status transitions |
| `TrustedIssuer` | System trust registry |
| `Job` | Bank recruitment job |
| `Application` | Holder job application |
| `VerificationRequest` | Bank claim request |
| `Presentation` | Holder-approved claim presentation |
| `VerificationResult` | Persisted verification outcome |
| `RefreshToken` | Hashed refresh-token state |
| `AuditLog` | Security and business audit events |

---

# Prerequisites

Install the following before running the backend locally.

## Required

### Node.js

Recommended project runtime:

```text
Node.js 24
```

Check:

```bash
node --version
```

### npm

Check:

```bash
npm --version
```

### PostgreSQL

You need a reachable PostgreSQL database.

Supported options include:

- local PostgreSQL;
- Docker PostgreSQL;
- a hosted PostgreSQL provider.

### Redis

Redis 7+ is recommended.

The easiest local option is Docker.

## Recommended tools

- Git
- Docker Desktop
- Postman
- VS Code
- Prisma Studio
- a PostgreSQL client if desired

---

# Local Installation

## 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd ssi-academic-credential-backend
```

## 2. Install dependencies

```bash
npm install
```

For CI/reproducible installation when a lockfile is present:

```bash
npm ci
```

## 3. Create the local environment file

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### macOS/Linux

```bash
cp .env.example .env
```

Do not commit `.env`.

---

# Environment Configuration

The project includes `.env.example`.

A local development configuration has the following shape:

```env
# Application
NODE_ENV=development
PORT=3000

# PostgreSQL
DATABASE_URL=postgresql://username:password@localhost:5432/ssi_academic_credentials?schema=public

# Optional provider-specific direct URL
DIRECT_URL=

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=replace_with_a_long_random_access_secret
JWT_REFRESH_SECRET=replace_with_a_different_long_random_refresh_secret

JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AES-256-GCM
MASTER_ENCRYPTION_KEY=replace_with_64_hex_characters

# Demo seed password
SEED_DEFAULT_PASSWORD=replace_with_a_strong_seed_password

# CORS
CORS_ORIGIN=http://localhost:3000

# Swagger
SWAGGER_ENABLED=true
```

## Generate an encryption key

`MASTER_ENCRYPTION_KEY` must be exactly 32 bytes represented as 64 hexadecimal characters.

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Generate JWT secrets

Generate separate values for access and refresh secrets.

Example:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run the command twice and use different values for:

```text
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
```

Never use the sample placeholder values in a real environment.

---

# PostgreSQL Setup

## Option A — Existing PostgreSQL

Create a database such as:

```text
ssi_academic_credentials
```

Then configure:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ssi_academic_credentials?schema=public
```

## Option B — Docker PostgreSQL

Example:

```bash
docker run -d \
  --name ssi-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ssi_academic_credentials \
  -p 5432:5432 \
  postgres:16-alpine
```

Then:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ssi_academic_credentials?schema=public
```

> Do not reuse development credentials in production.

---

# Redis Setup

## Start Redis with Docker

```bash
docker run -d --name ssi-redis -p 6379:6379 redis:7-alpine
```

If the container already exists:

```bash
docker start ssi-redis
```

Check that it is running:

```bash
docker ps
```

Local Redis configuration:

```env
REDIS_URL=redis://localhost:6379
```

Redis is used for short-lived verification sessions and nonce/replay protection.

---

# Database Initialization

The easiest setup command is:

```bash
npm run db:setup
```

This runs the equivalent of:

```bash
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run setup:dids
```

Or individually:

```bash
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
npx tsx prisma/create-initial-dids.ts
```

The DID initialization script is idempotent and reuses initial DIDs when they already exist.

## Open Prisma Studio

```bash
npx prisma studio
```

Use Prisma Studio to inspect:

- organizations;
- users;
- academic records;
- credentials;
- wallet records;
- jobs;
- applications;
- verification requests;
- presentations;
- verification results;
- audit logs.

---

# Database Cleanup and Reset

The project can use a destructive cleanup helper for local/manual testing.

## Clean application data

```bash
npm run db:clean
```

The cleanup process is intended to:

- remove application data;
- restart database identities where applicable;
- cascade through related application tables;
- preserve Prisma migration history.

> **Warning:** `db:clean` is destructive. Never point it at a production database unless complete deletion is explicitly intended.

## Clean and restore the demo state

For a fresh Postman/manual testing session:

```bash
npm run db:clean:seed
```

Conceptually this performs:

```text
clean application data
    -> seed demo users and organizations
    -> create/reuse initial DIDs
```

This is the recommended starting point before repeating the entire manual API verification sequence.

---

# Running the Application Locally

## Development mode

```bash
npm run start:dev
```

NestJS runs in watch mode and automatically rebuilds after source changes.

Default port:

```text
3000
```

## Standard mode

```bash
npm start
```

## Production build

```bash
npm run build
npm run start:prod
```

---

# Local URLs

Assuming the default port:

| Resource | URL |
|---|---|
| API base URL | `http://localhost:3000/api/v1` |
| Health | `http://localhost:3000/api/v1/health` |
| Swagger UI | `http://localhost:3000/api/docs` |
| Prisma Studio | Usually `http://localhost:5555` after `npx prisma studio` |

Swagger is available when:

```env
SWAGGER_ENABLED=true
```

---

# Demo Accounts

The seed creates demo accounts.

| Role | Email |
|---|---|
| System Administrator | `system.admin@example.com` |
| University Issuer Administrator | `issuer.admin@example.com` |
| Bank Verifier Administrator | `verifier.admin@example.com` |
| Credential Holder | `applicant@example.com` |

All demo accounts use the password configured in:

```env
SEED_DEFAULT_PASSWORD
```

The README intentionally does not contain that password.

---

# Authentication

Most protected endpoints use:

```http
Authorization: Bearer <access-token>
```

Typical login request:

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "issuer.admin@example.com",
  "password": "<SEED_DEFAULT_PASSWORD>"
}
```

Login returns an access token, refresh token, and user information inside the standard success envelope.

The Postman collection automatically stores these values in **Collection Variables**, so manual copying of tokens between requests is not required.

---

# API Response Format

## Standard success response

Most successful endpoints return:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "timestamp": "2026-09-17T00:00:00.000Z"
  }
}
```

## Paginated response

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0,
    "timestamp": "2026-09-17T00:00:00.000Z"
  }
}
```

## Error response

```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Access denied"
  },
  "meta": {
    "timestamp": "2026-09-17T00:00:00.000Z",
    "path": "/api/v1/...",
    "requestId": "..."
  }
}
```

Validation errors can additionally include:

```json
{
  "details": [
    "field must be a UUID"
  ]
}
```

## Health response

The health endpoint intentionally remains unwrapped:

```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "timestamp": "..."
}
```

---

# Major API Endpoints

All paths below are relative to:

```text
http://localhost:3000/api/v1
```

## Health

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | PostgreSQL + Redis health check |

## Authentication

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register a holder |
| `POST` | `/auth/login` | Public | Login and issue tokens |
| `POST` | `/auth/refresh` | Refresh token | Rotate refresh/access tokens |
| `GET` | `/auth/me` | Authenticated | Current user |
| `POST` | `/auth/logout` | Authenticated | Revoke refresh token |
| `GET` | `/auth/rbac/holder` | Holder | RBAC demonstration |
| `GET` | `/auth/rbac/issuer` | Issuer | RBAC demonstration |

## DID Resolution

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/dids/:did` | Public demo | Resolve a mock DID document |

## Trust Registry

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/trust-registry/issuers` | System Admin | Add trusted university issuer |
| `GET` | `/trust-registry/issuers` | System Admin | List trusted issuers |
| `GET` | `/trust-registry/issuers/:did` | System Admin | Resolve trusted issuer |
| `PATCH` | `/trust-registry/issuers/:id/suspend` | System Admin | Suspend trusted issuer |

## Academic Records

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/academic-records` | Issuer | Create academic record |
| `GET` | `/academic-records` | Issuer | List university academic records |
| `GET` | `/academic-records/:id` | Issuer | Retrieve academic record |
| `PATCH` | `/academic-records/:id` | Issuer | Update academic record |

## Credential Schemas

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/credential-schemas` | Issuer | Create credential schema |
| `GET` | `/credential-schemas` | Issuer | List credential schemas |

## Credentials

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/credentials/issue` | Issuer | Issue credential |
| `GET` | `/credentials/issued` | Issuer | List issued credentials |
| `GET` | `/credentials/:id/status` | Authorized | Get current credential status |
| `GET` | `/credentials/:id/status-history` | Issuer | Get lifecycle history |
| `POST` | `/credentials/:id/suspend` | Issuer | Suspend active credential |
| `POST` | `/credentials/:id/reactivate` | Issuer | Reactivate suspended credential |
| `POST` | `/credentials/:id/revoke` | Issuer | Permanently revoke credential |

## Holder Wallet

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/wallet/credentials` | Holder | List wallet credentials |
| `GET` | `/wallet/credentials/:id` | Holder | Decrypt/view owned wallet credential |
| `GET` | `/wallet/requests` | Holder | List pending verification requests |

> The `:id` in `/wallet/credentials/:id` refers to the **wallet credential ID**, not the credential metadata ID.

## Recruitment Jobs

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/jobs` | Verifier | Create job |
| `GET` | `/jobs` | Authenticated | List jobs |
| `GET` | `/jobs/:id` | Authenticated | Get job |
| `PATCH` | `/jobs/:id` | Verifier | Update bank-owned job |

## Applications

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/applications` | Holder | Apply for a job |
| `GET` | `/applications/me` | Holder | List holder applications |
| `GET` | `/applications/:id` | Holder / Verifier | Get authorized application |

## Verification Requests

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/verification-requests` | Verifier | Request required credential claims |
| `GET` | `/verification-requests/:id` | Holder / Verifier | Get authorized request |
| `POST` | `/verification-requests/:id/approve` | Holder | Approve claims and create presentation |
| `POST` | `/verification-requests/:id/reject` | Holder | Reject verification request |

## Verification

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/verification/presentations/:presentationId/verify` | Verifier | Verify presentation and credential |

## Audit Logs

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/audit-logs` | Authorized Admin | List scoped audit logs |

System administrators can review system-wide logs. Issuer/verifier administrators are scoped to their organization where applicable.

---

# Pagination and Filtering

Major list endpoints support:

```text
page
limit
```

Example:

```http
GET /api/v1/credentials/issued?page=1&limit=20
```

Typical metadata:

```json
{
  "page": 1,
  "limit": 20,
  "total": 25,
  "totalPages": 2
}
```

Additional filters depend on the endpoint.

Examples include:

### Academic records

```text
status
holderId
studentId
```

### Issued credentials

```text
status
holderId
issuedFrom
issuedTo
```

### Wallet credentials

```text
status
issuedFrom
issuedTo
```

### Jobs

```text
status
bankId
```

### Applications

```text
status
educationVerificationStatus
jobId
```

### Trusted issuers

```text
status
organizationId
```

### Audit logs

```text
action
```

See Postman or Swagger for the exact query parameters available on each route.

---

# Credential Lifecycle

Credential state transitions are intentionally restricted.

```text
               +-----------+
               |  ACTIVE   |
               +-----+-----+
                     |
             +-------+-------+
             |               |
             v               v
       +-----------+     +---------+
       | SUSPENDED |     | REVOKED |
       +-----+-----+     +---------+
             |
             v
         +--------+
         | ACTIVE |
         +--------+

ACTIVE ------------------> EXPIRED
```

Allowed examples:

```text
ACTIVE -> SUSPENDED
ACTIVE -> REVOKED
SUSPENDED -> ACTIVE
SUSPENDED -> REVOKED
```

Not allowed:

```text
REVOKED -> ACTIVE
EXPIRED -> ACTIVE
```

Each status change is recorded in credential status history and audit logs.

---

# Verification Request Lifecycle

A typical verification request moves through:

```text
PENDING
   |
   +----> APPROVED
   |
   +----> REJECTED
   |
   +----> EXPIRED
```

Requests are:

- scoped to a specific application;
- tied to a holder;
- created by a bank verifier;
- associated with requested claims;
- backed by a short-lived Redis session;
- protected by a nonce;
- intended for one-time verification.

---

# Credential Verification Pipeline

The verifier does not rely on a single signature check.

The verification engine performs a sequence of checks, including:

1. Verification request exists.
2. Verification request is in an acceptable state.
3. Redis verification session exists.
4. Session has not expired.
5. Nonce matches the expected request/session.
6. Presentation belongs to the expected request.
7. Holder identity matches.
8. Holder DID is valid.
9. Holder presentation signature is valid.
10. Credential exists.
11. Credential integrity hash matches.
12. Issuer DID is valid.
13. Credential issuer signature is valid.
14. Issuer is present and active in the trust registry.
15. Credential status is acceptable.
16. Credential has not expired.
17. Credential holder matches the applicant.
18. Disclosed claims are permitted by the request.
19. Disclosed values match the credential.
20. Verification result is persisted.
21. Verified academic application data is updated.
22. Audit success/failure is recorded.
23. Replay of an already consumed verification is rejected.

A failed verification does not silently pass; it is persisted as a failure and can be audited.

---

# Audit Logging

The project records major security and business events.

Examples include:

```text
LOGIN
LOGOUT
DID_CREATED
ACADEMIC_RECORD_CREATED
CREDENTIAL_ISSUED
CREDENTIAL_VIEWED
CREDENTIAL_REQUEST_CREATED
CREDENTIAL_REQUEST_APPROVED
CREDENTIAL_REQUEST_REJECTED
PRESENTATION_CREATED
CREDENTIAL_VERIFIED
VERIFICATION_FAILED
CREDENTIAL_SUSPENDED
CREDENTIAL_REACTIVATED
CREDENTIAL_REVOKED
TRUSTED_ISSUER_ADDED
TRUSTED_ISSUER_SUSPENDED
```

Audit records may contain:

- actor ID;
- organization ID;
- action;
- resource type;
- resource ID;
- minimal contextual metadata;
- timestamp.

Audit metadata must not contain:

- plaintext passwords;
- JWTs;
- refresh tokens;
- database credentials;
- master encryption keys;
- private signing keys;
- unnecessarily duplicated full credentials.

---

# Postman API Documentation

A complete manually tested Postman documentation set is published here:

**https://documenter.getpostman.com/view/56181938/2sBYB1MnWj**

Manual verification status:

```text
56 / 56 requests passed
```

The Postman collection is designed as a chronological workflow from smoke testing through security testing.

## Collection variables

The collection uses **Postman Collection Variables**, not environment variables.

Examples of runtime variables include:

```text
baseUrl
systemAdminAccessToken
issuerAccessToken
verifierAccessToken
holderAccessToken
holderId
universityId
bankId
academicRecordId
schemaId
credentialId
walletCredentialId
jobId
applicationId
verificationRequestId
presentationId
verificationResultId
```

Post-response scripts automatically store generated IDs and tokens for later requests.

For example, login requests save tokens to collection variables so subsequent API requests can use:

```text
{{issuerAccessToken}}
{{holderAccessToken}}
{{verifierAccessToken}}
```

This makes the entire manual test flow reproducible without repeatedly copying IDs or JWTs.

## Publishing Postman examples safely

Published examples should never contain real:

- passwords;
- access tokens;
- refresh tokens;
- authorization headers;
- database URLs;
- JWT secrets;
- encryption keys;
- encrypted private-key data.

Use placeholders such as:

```text
<REDACTED_ACCESS_TOKEN>
<REDACTED_REFRESH_TOKEN>
```

for documentation examples.

---

# Swagger / OpenAPI

Swagger provides a machine-readable API contract and an interactive API reference.

Enable it with:

```env
SWAGGER_ENABLED=true
```

Then open:

```text
http://localhost:3000/api/docs
```

Swagger documents:

- endpoint groups;
- methods;
- request DTOs;
- query parameters;
- enum values;
- authentication requirements;
- success responses;
- validation/auth/error responses.

For this project:

- **Swagger** is the interactive API contract/reference.
- **Postman** is the manually executed, saved-example API documentation and full workflow verification.

Both are kept because they serve different purposes.

---

# Testing

## Format source code

```bash
npm run format
```

## Check formatting without modifying files

```bash
npm run format:check
```

## Build

```bash
npm run build
```

## Lint and auto-fix

```bash
npm run lint
```

## CI-safe lint check

```bash
npm run lint:check
```

Generated Prisma code is excluded from application lint checks because it is generated and should not be manually edited.

## Unit tests

```bash
npm test
```

Verified result:

```text
Test Suites: 23 passed, 23 total
Tests:       84 passed, 84 total
```

## Unit test watch mode

```bash
npm run test:watch
```

## Test coverage

```bash
npm run test:cov
```

## E2E/security tests

Make sure PostgreSQL and Redis are available, then run:

```bash
npm run test:e2e
```

Verified result:

```text
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

The E2E suite covers:

- health/database/Redis;
- authentication/RBAC;
- full credential-to-bank verification workflow;
- tampered disclosed CGPA;
- revoked credential;
- untrusted issuer;
- replayed presentation.

The E2E script uses Node VM modules because of the Prisma/Jest runtime combination.

An experimental VM modules warning during the E2E command can therefore be expected.

## Complete verification

```bash
npm run verify
```

This performs:

```text
format:check
    -> build
    -> lint:check
    -> unit tests
    -> E2E/security tests
```

A successful `npm run verify` is the recommended final local quality gate before pushing changes.

---

# Project Scripts

The main npm scripts include:

| Script | Purpose |
|---|---|
| `npm run build` | Compile NestJS |
| `npm run start` | Start application |
| `npm run start:dev` | Development watch mode |
| `npm run start:debug` | Debug/watch mode |
| `npm run start:prod` | Start compiled application |
| `npm run format` | Run Prettier and modify source |
| `npm run format:check` | Verify formatting |
| `npm run lint` | ESLint with auto-fix |
| `npm run lint:check` | CI-safe lint |
| `npm test` | Unit tests |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:cov` | Unit test coverage |
| `npm run test:e2e` | E2E/security tests |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:seed` | Seed demo data |
| `npm run setup:dids` | Create/reuse initial DIDs |
| `npm run db:setup` | Generate + migrate + seed + DID setup |
| `npm run db:clean` | Destructively clean application data |
| `npm run db:clean:seed` | Clean and recreate demo state |
| `npm run verify` | Run the complete local quality gate |

---

# Project Structure

A simplified project layout:

```text
ssi-academic-credential-backend/
|
|-- .github/
|   `-- workflows/
|       `-- ci.yml
|
|-- prisma/
|   |-- migrations/
|   |-- schema.prisma
|   |-- seed.ts
|   |-- create-initial-dids.ts
|   `-- clean-database.ts
|
|-- src/
|   |-- academic-records/
|   |-- applications/
|   |-- audit/
|   |-- auth/
|   |-- common/
|   |   |-- constants/
|   |   |-- decorators/
|   |   |-- dto/
|   |   |-- filters/
|   |   |-- guards/
|   |   |-- interceptors/
|   |   |-- swagger/
|   |   `-- utils/
|   |
|   |-- credential-schemas/
|   |-- credentials/
|   |-- crypto/
|   |-- did/
|   |-- generated/
|   |   `-- prisma/
|   |-- health/
|   |-- jobs/
|   |-- organizations/
|   |-- prisma/
|   |-- redis/
|   |-- trust-registry/
|   |-- users/
|   |-- verification/
|   |-- verification-requests/
|   |-- wallet/
|   |-- app.module.ts
|   `-- main.ts
|
|-- test/
|   |-- app.e2e-spec.ts
|   `-- jest-e2e.json
|
|-- .env.example
|-- nest-cli.json
|-- package.json
|-- prisma.config.ts
|-- tsconfig.json
`-- README.md
```

Do not manually edit:

```text
src/generated/prisma/
```

It is generated by Prisma.

---

# Troubleshooting

## Redis connection failure

Symptoms may include health returning degraded status or verification-session failures.

Start Redis:

```bash
docker start ssi-redis
```

Or create it:

```bash
docker run -d --name ssi-redis -p 6379:6379 redis:7-alpine
```

Check:

```bash
docker ps
```

## PostgreSQL connection failure

Verify:

```env
DATABASE_URL
```

Then try:

```bash
npx prisma migrate deploy
```

For hosted PostgreSQL, use the TLS settings recommended by the provider.

An explicit verification mode such as:

```text
sslmode=verify-full
```

is preferable when supported and correctly configured.

## Prisma Client is missing/out of date

Run:

```bash
npm run prisma:generate
```

## Database schema is not initialized

Run:

```bash
npm run db:migrate
```

Or run the complete setup:

```bash
npm run db:setup
```

## Seed users are missing

Run:

```bash
npm run db:seed
```

## Initial DIDs are missing

Run:

```bash
npm run setup:dids
```

The setup is designed to be idempotent.

## Port 3000 is already in use

Change:

```env
PORT=3001
```

Then your API becomes:

```text
http://localhost:3001/api/v1
```

## 401 Unauthorized

Check that:

- the request contains a bearer access token;
- the token has not expired;
- the correct Postman collection variable is being used.

## 403 Forbidden

Authentication succeeded, but the current user does not have the required role or resource scope.

## E2E `--experimental-vm-modules` warning

The E2E script intentionally launches Jest using:

```text
--experimental-vm-modules
```

for compatibility with the Prisma runtime used by the project.

The warning itself is not a test failure.

## PostgreSQL SSL warning

If a hosted database client warns about future SSL-mode semantics, use the provider's recommended TLS mode.

Do not disable TLS verification just to suppress the warning.

---

# Security and Secret Management

Never commit:

```text
.env
```

Check:

```bash
git ls-files .env
```

The command should return nothing.

Never commit or publish:

- PostgreSQL passwords;
- production database URLs;
- JWT secrets;
- access tokens;
- refresh tokens;
- demo passwords if they are reused elsewhere;
- master encryption keys;
- decrypted private keys;
- production Redis credentials.

Recommended production secret sources include:

- deployment-platform environment variables;
- GitHub Actions secrets;
- a dedicated secrets manager.

## Logs

Authorization headers and sensitive values should remain redacted.

Do not log:

```text
password
refreshToken
accessToken
privateKey
MASTER_ENCRYPTION_KEY
DATABASE_URL
```

## Audit logs

Audit logs should contain enough metadata for traceability without duplicating sensitive payloads.

---

# Production Considerations

This project is complete as a backend prototype, but a production deployment should additionally consider:

- real DID infrastructure or a standards-compliant identity framework;
- formal VC interoperability;
- managed secret storage;
- encryption-key rotation;
- signature-key rotation and recovery;
- PostgreSQL backup and recovery;
- Redis persistence/high availability where required;
- centralized log storage;
- monitoring and alerting;
- TLS termination;
- stricter production CORS configuration;
- API gateway/WAF where appropriate;
- rate-limit tuning;
- automated vulnerability/dependency scanning;
- regular credential/status archival policies;
- data retention and privacy requirements;
- production deployment and rollback strategy.

---

# Known Prototype Limitations

The following limitations are intentional and should be understood when evaluating the project.

### Mock DIDs

The DID implementation is project-specific and not connected to a public DID network.

### Application-level selective disclosure

Selective disclosure is implemented by extracting only approved claims into the presentation.

It is **not cryptographic zero-knowledge selective disclosure**.

### Custom VC-style credential

The credential format demonstrates the required academic credential flow but should not automatically be assumed interoperable with every W3C VC ecosystem.

### Prototype trust model

The trusted issuer registry is maintained by the application/system administrator.

### No frontend included here

This repository is the backend API. It can be consumed by Postman, Swagger, a web frontend, or another client.

---

# Final Verification Checklist

Before declaring a local setup healthy:

```bash
npm run format:check
npm run build
npm run lint:check
npm test
npm run test:e2e
```

Or:

```bash
npm run verify
```

Then verify:

- `GET /api/v1/health` returns `status: ok`.
- PostgreSQL reports connected.
- Redis reports connected.
- Swagger opens at `/api/docs`.
- Postman can authenticate all seeded roles.
- `.env` is not tracked by Git.
- no secrets are present in committed files;
- migrations apply successfully;
- seed succeeds;
- DID setup succeeds;
- all 84 unit tests pass;
- all 7 E2E/security tests pass;
- the complete 56-request Postman manual run passes.

---

**SSI Academic Credential Backend**  
NestJS + PostgreSQL + Prisma + Redis + JWT + Ed25519 + AES-256-GCM
