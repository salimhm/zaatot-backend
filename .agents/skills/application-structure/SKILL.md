---
name: application-structure
description: Application structure and /src folder tree for our backend.
---

# Application Structure
```
public/
src/
├── app.ts
├── db/
│   ├── client.db.ts
│   ├── main.schema.db.ts
│   ├── tenant.schema.db.ts
│   ├── utils.db.ts
│   └── utils.dto.db.ts
├── ai/
│   ├── agent/
│   │   ├── <specialization>/
│   │   │   ├── <specialization>.agent.ts
│   │   │   ├── <specialization>.prompt.agent.ts
│   │   │   └── <specialization>.schema.agent.ts
│   ├── tool/
│   │   ├── <module-name>/
│   │   │   ├── <module-name>.tool.ts
│   │   │   └── <module-name>.dto.tool.ts
│   │   └── utils.tool.ts
│   └── utils.ai.ts
├── lib/
│   ├── dto.lib.ts # GLOBAL REUSED DTO's
│   ├── enum.lib.ts # GLOBAL REUSED ENUM's
│   └── error.lib.ts # GLOBAL REUSED ERROR's
├── module/
│   ├── main/ # Shared/Standard backend entities
│   │   ├── auth/
│   │   ├── tenant/
│   │   └── user/
│   └── tenant/ # Tenant specific features
│       ├── access/
│       ├── contact/
│       └── file/
└── storage/
    └── client.storage.ts
```
