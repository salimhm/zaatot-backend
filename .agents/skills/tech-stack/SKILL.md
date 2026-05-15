---
name: tech-stack
description: tech stack used in our backend.
---

# Tech Stack
* **Runtime environment**: Bun latest version + @types/bun latest version as devDependencies

* **Programming language**: TypeScript version ^6.x.x as devDependencies

* **Framework**: 
  1. ElysiaJS version ^1.x.x
  2. @elysiajs/jwt version ^1.x.x
  3. @elysiajs/cors version ^1.x.x
  4. @elysiajs/swagger version ^1.x.x

* **Database**: TursoDB + @libsql/client version ^0.x.x + @tursodatabase/api version ^1.x.x

* **ORM**: drizzle-orm version ^0.x.x as dependencies and drizzle-kit version ^0.x.x as devDependencies

* **Object Storage**: Cloudflare R2 + @aws-sdk/client-s3 version ^3.x.x

* **AI Framework**:
  1. @voltagent/core: ^2.x.x,
  2. @voltagent/server-elysia: ^2.x.x,
  3. @voltagent/libsql: ^2.x.x,
  4. @ai-sdk/google version ^3.x.x
  5. ai version ^6.x.x

* **AI Agent Validator**: zod version ^4.x.x