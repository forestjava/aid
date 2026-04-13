## Prisma 6 Schema Reference

### Schema Structure

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
}

model Post {
  id        String   @id @default(uuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
}
```

### Key Decorators
- `@id` — primary key
- `@default(uuid())` — auto UUID
- `@default(now())` — auto timestamp
- `@unique` — unique constraint
- `@updatedAt` — auto-update timestamp
- `@relation(fields: [fk], references: [id])` — explicit relation
- `@@map("table_name")` — custom table name
- `@@index([field1, field2])` — composite index

### Types
String, Int, Float, Boolean, DateTime, Json, Bytes, BigInt, Decimal

### Relations
- One-to-many: parent has `Child[]`, child has `parent Parent @relation(fields: [parentId], references: [id])`
- Many-to-many: implicit `Tag[] ↔ Post[]` or explicit join table
- Optional: `parent Parent? @relation(...)` + `parentId String?`
