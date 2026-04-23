# Field Contract — Cross-Layer Rules (Prisma ↔ NestJS ↔ react-admin)

> **READ COMPLETELY before generating ANY model, DTO, controller, or react-admin component.**
> Every rule here is MANDATORY. Violating a rule breaks the running app.
>
> For every field type there is exactly ONE acceptable pattern — copy it.
> If your field does not match any pattern in §3, map it to the closest one and add a comment.

---

## 1. Global API contract (list endpoints)

Every resource exposes these endpoints under `/api/<resource>`:

| Method | Path         | Response shape                      |
|--------|--------------|-------------------------------------|
| GET    | `/<res>`     | `{ data: T[], total: number }`      |
| GET    | `/<res>/:id` | `T`                                 |
| POST   | `/<res>`     | `T` (HTTP 201)                      |
| PATCH  | `/<res>/:id` | `T`                                 |
| DELETE | `/<res>/:id` | `T`                                 |

List query parameters (ALL optional, strings):

| Param     | Format                              | Example                         |
|-----------|-------------------------------------|---------------------------------|
| `skip`    | integer ≥ 0                         | `0`                             |
| `take`    | integer ≥ 1                         | `25`                            |
| `orderBy` | JSON: `{ "<field>": "asc"\|"desc" }`| `{"id":"asc"}`                  |
| `where`   | JSON: Prisma `Where<Model>Input`    | `{"status":"Active"}`           |

**Never return bare arrays. Never rely on `Content-Range`. Never paginate via `page`/`limit`.**

### Service pattern (copy exactly)

```typescript
async findAll(params: {
  skip?: number;
  take?: number;
  where?: Prisma.<Model>WhereInput;
  orderBy?: Prisma.<Model>OrderByWithRelationInput;
}): Promise<{ data: <Model>[]; total: number }> {
  const { skip, take, where, orderBy } = params;
  const [data, total] = await this.prisma.$transaction([
    this.prisma.<model>.findMany({ skip, take, where, orderBy }),
    this.prisma.<model>.count({ where }),
  ]);
  return { data, total };
}
```

### Controller list handler (copy exactly)

```typescript
const parseJson = <T>(v?: string): T | undefined => {
  if (!v) return undefined;
  try { return JSON.parse(v) as T; } catch { return undefined; }
};

@Get()
findAll(
  @Query('skip') skip?: string,
  @Query('take') take?: string,
  @Query('orderBy') orderBy?: string,
  @Query('where') where?: string,
) {
  return this.service.findAll({
    skip: skip ? Number(skip) : 0,
    take: take ? Number(take) : 25,
    orderBy: parseJson(orderBy),
    where: parseJson(where),
  });
}
```

---

## 2. ID — MANDATORY on every model

Every Prisma model MUST have a field named `id` with `@id`. Composite primary keys (`@@id([a, b])`) are **forbidden** — they break the frontend sort/lookup.

Pick ONE of these two forms per model; stay consistent within a project.

```prisma
id  Int     @id @default(autoincrement())       // preferred
// or
id  String  @id @default(uuid())
```

- `id` is **never** in `CreateDto` (it is auto-generated).
- `id` is **never** in `UpdateDto` body (it comes from the URL param).
- On the frontend it is hidden from forms; shown via `<TextField source="id" />` or `<NumberField source="id" />` where needed.

---

## 3. Field types

Each section lists, for ONE Prisma type:
- **Prisma**: schema fragment
- **Create DTO**: decorators for a field on `Create<Model>Dto`
- **Update DTO**: decorators for the same field on `Update<Model>Dto` (always `@IsOptional()`)
- **RA Input**: form input in `<Create>` / `<Edit>`
- **RA Field**: display in `<List>` / `<Show>`
- **Wire**: JSON value actually sent/received over HTTP

### 3.1 String (required)

```prisma
name  String
```

```typescript
// CreateDto
@IsString() @IsNotEmpty()
name: string;

// UpdateDto
@IsString() @IsOptional()
name?: string;
```

- **RA Input:** `<TextInput source="name" />`
- **RA Field:** `<TextField source="name" />`
- **Wire:** `"some string"`

### 3.2 String (optional / nullable)

```prisma
description  String?
```

```typescript
// CreateDto + UpdateDto
@IsString() @IsOptional()
description?: string | null;
```

- **RA Input:** `<TextInput source="description" multiline />`
- **RA Field:** `<TextField source="description" />`

### 3.3 Int

```prisma
count  Int
```

```typescript
// CreateDto
@IsInt() @Type(() => Number)
count: number;

// UpdateDto
@IsInt() @IsOptional() @Type(() => Number)
count?: number;
```

- **RA Input:** `<NumberInput source="count" />`
- **RA Field:** `<NumberField source="count" />`
- **Wire:** `42`

### 3.4 Float / Decimal

```prisma
price  Float      // or: price Decimal
```

```typescript
// CreateDto
@IsNumber() @Type(() => Number)
price: number;
```

- **RA Input:** `<NumberInput source="price" step={0.01} />`
- **RA Field:** `<NumberField source="price" options={{ style: 'currency', currency: 'USD' }} />`
- **Wire:** `19.99`

### 3.5 Boolean

```prisma
isActive  Boolean  @default(true)
```

```typescript
// CreateDto
@IsBoolean() @IsOptional()
isActive?: boolean;
```

- **RA Input:** `<BooleanInput source="isActive" />`
- **RA Field:** `<BooleanField source="isActive" />`
- **Wire:** `true` / `false`

### 3.6 DateTime (full timestamp)

Use when you need both date AND time (e.g. `createdAt`, `startedAt`, `loggedAt`).

```prisma
createdAt  DateTime  @default(now())
updatedAt  DateTime  @updatedAt
```

```typescript
// Fields like createdAt/updatedAt are managed by Prisma —
// do NOT include them in Create/Update DTOs.

// For user-settable timestamps:
@IsISO8601() @Type(() => Date) @IsOptional()
startedAt?: Date;
```

- **RA Input:** `<DateTimeInput source="startedAt" />`
- **RA Field:** `<DateField source="startedAt" showTime />`
- **Wire:** ISO-8601 with timezone, e.g. `"2026-04-23T10:30:00.000Z"`
- **Runtime safety:** backend `NormalizeDatesInterceptor` auto-pads `"YYYY-MM-DDTHH:mm"` → `"YYYY-MM-DDTHH:mm:00.000Z"`.

### 3.7 Date only (no time component)

Use when the field represents a calendar date (e.g. `dateOfBirth`, `dateOfInspection`, `commissionedAt`).

```prisma
dateOfInspection  DateTime  @db.Date
```

```typescript
// CreateDto
@IsISO8601() @Type(() => Date)
dateOfInspection: Date;

// UpdateDto
@IsISO8601() @Type(() => Date) @IsOptional()
dateOfInspection?: Date;
```

- **RA Input:** `<DateInput source="dateOfInspection" />`
- **RA Field:** `<DateField source="dateOfInspection" />`
- **Wire:** `"YYYY-MM-DD"` is accepted (react-admin default).
- **Runtime safety:** backend `NormalizeDatesInterceptor` pads `"YYYY-MM-DD"` → `"YYYY-MM-DDT00:00:00.000Z"` before hitting Prisma. **Without this interceptor, Prisma throws `premature end of input. Expected ISO-8601 DateTime`. Never remove it.**

### 3.8 Enum

```prisma
enum EquipmentStatus {
  Active
  Inactive
  Repair
}

model Equipment {
  id      Int              @id @default(autoincrement())
  status  EquipmentStatus  @default(Active)
}
```

```typescript
// Import the enum from @prisma/client
import { EquipmentStatus } from '@prisma/client';

// CreateDto
@IsEnum(EquipmentStatus)
status: EquipmentStatus;

// UpdateDto
@IsEnum(EquipmentStatus) @IsOptional()
status?: EquipmentStatus;
```

- **RA Input:**

```tsx
const statusChoices = [
  { id: 'Active',   name: 'Active' },
  { id: 'Inactive', name: 'Inactive' },
  { id: 'Repair',   name: 'Repair' },
];

<SelectInput source="status" choices={statusChoices} />
```

- **RA Field:** `<TextField source="status" />`
- **Wire:** `"Active"` (the enum member name, as a string)

### 3.9 Json

```prisma
metadata  Json?
```

```typescript
@IsObject() @IsOptional()
metadata?: Record<string, unknown>;
```

- **RA Input:** `<TextInput source="metadata" multiline format={v => JSON.stringify(v)} parse={v => JSON.parse(v)} />`
- **RA Field:** `<FunctionField source="metadata" render={r => <pre>{JSON.stringify(r.metadata, null, 2)}</pre>} />`
- **Wire:** arbitrary JSON value

### 3.10 Bytes

Avoid unless strictly necessary. Store files on disk/S3 and keep only the URL as a String.

---

## 4. Relations

### 4.1 Many-to-one (owning side — has the foreign key)

Example: each `ChangeEquipmentStatus` belongs to one `Equipment`.

```prisma
model ChangeEquipmentStatus {
  id           Int        @id @default(autoincrement())
  equipment    Equipment  @relation(fields: [equipmentId], references: [id])
  equipmentId  Int
  // ...
}
```

```typescript
// CreateChangeEquipmentStatusDto
@IsInt() @Type(() => Number)
equipmentId: number;

// UpdateChangeEquipmentStatusDto
@IsInt() @Type(() => Number) @IsOptional()
equipmentId?: number;
```

- **RA Input:** `<ReferenceInput source="equipmentId" reference="equipment"><SelectInput optionText="name" /></ReferenceInput>`
- **RA Field:** `<ReferenceField source="equipmentId" reference="equipment"><TextField source="name" /></ReferenceField>`
- **Wire:** `equipmentId: 7`

**Naming rule:** FK column is `<relationName>Id`. Relation field is `<relationName>`.

### 4.2 One-to-many (inverse side — no FK, no DTO field)

```prisma
model Equipment {
  id             Int                       @id @default(autoincrement())
  statusChanges  ChangeEquipmentStatus[]
}
```

- Do NOT include `statusChanges` in Create/Update DTOs of `Equipment`. Managed via the owning side.
- **RA display (on Show page):**

```tsx
<ReferenceManyField reference="change-equipment-status" target="equipmentId" label="Status changes">
  <Datagrid>
    <TextField source="id" />
    <DateField source="date" />
  </Datagrid>
</ReferenceManyField>
```

### 4.3 Many-to-many (implicit join)

```prisma
model Post {
  id    Int    @id @default(autoincrement())
  tags  Tag[]
}
model Tag {
  id     Int     @id @default(autoincrement())
  posts  Post[]
}
```

```typescript
// CreatePostDto
@IsArray() @IsInt({ each: true }) @IsOptional()
tagIds?: number[];
```

In the service, translate `tagIds` to `{ connect: tagIds.map(id => ({ id })) }`.

- **RA Input:** `<ReferenceArrayInput source="tagIds" reference="tag"><SelectArrayInput optionText="name" /></ReferenceArrayInput>`
- **RA Field:** `<ReferenceArrayField source="tagIds" reference="tag"><SingleFieldList><ChipField source="name" /></SingleFieldList></ReferenceArrayField>`

### 4.4 One-to-one

```prisma
model User {
  id       Int      @id @default(autoincrement())
  profile  Profile?
}
model Profile {
  id     Int   @id @default(autoincrement())
  user   User  @relation(fields: [userId], references: [id])
  userId Int   @unique
}
```

Treat as many-to-one from `Profile` side. Add `@unique` on FK.

### 4.5 Self-referential

```prisma
model Category {
  id        Int        @id @default(autoincrement())
  parent    Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  parentId  Int?
  children  Category[] @relation("CategoryTree")
}
```

Named relation via `@relation("CategoryTree", ...)` is REQUIRED for self-references.

---

## 5. String naming conventions (heuristic — apply when field name matches)

For `String` fields, ADD these validators on top of §3.1/3.2 based on the field name:

| Field name (regex)                   | Extra DTO validators      | RA Input extras               |
|--------------------------------------|---------------------------|-------------------------------|
| `email`                              | `@IsEmail()`              | `type="email"`                |
| `url`, `website`, `homepage`         | `@IsUrl()`                | `type="url"`                  |
| `phone`, `mobile`, `tel`             | `@Matches(/^\+?[\d ()-]+$/)` | `type="tel"`              |
| `slug`                               | `@Matches(/^[a-z0-9-]+$/)` | —                            |
| `password`                           | `@MinLength(8)`           | `type="password"`             |
| `color`, `hex`                       | `@Matches(/^#[0-9a-f]{6}$/i)` | —                         |

---

## 6. End-to-end example — `Equipment`

### 6.1 Prisma schema

```prisma
enum EquipmentStatus {
  Active
  Inactive
  Repair
}

model Equipment {
  id                Int                       @id @default(autoincrement())
  name              String
  serialNumber      String                    @unique
  status            EquipmentStatus           @default(Active)
  dateOfInspection  DateTime                  @db.Date
  commissionedAt    DateTime                  @db.Date
  statusChanges     ChangeEquipmentStatus[]
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt
}
```

### 6.2 DTOs

```typescript
// create-equipment.dto.ts
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { EquipmentStatus } from '@prisma/client';

export class CreateEquipmentDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsNotEmpty()
  serialNumber: string;

  @IsEnum(EquipmentStatus) @IsOptional()
  status?: EquipmentStatus;

  @IsISO8601() @Type(() => Date)
  dateOfInspection: Date;

  @IsISO8601() @Type(() => Date)
  commissionedAt: Date;
}
```

```typescript
// update-equipment.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateEquipmentDto } from './create-equipment.dto';

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {}
```

### 6.3 react-admin resource

```tsx
// equipment/list.tsx
<List>
  <Datagrid rowClick="edit">
    <TextField source="id" />
    <TextField source="name" />
    <TextField source="serialNumber" />
    <TextField source="status" />
    <DateField source="dateOfInspection" />
    <DateField source="commissionedAt" />
  </Datagrid>
</List>

// equipment/edit.tsx
<Edit>
  <SimpleForm>
    <TextInput source="name" />
    <TextInput source="serialNumber" />
    <SelectInput source="status" choices={[
      { id: 'Active',   name: 'Active' },
      { id: 'Inactive', name: 'Inactive' },
      { id: 'Repair',   name: 'Repair' },
    ]} />
    <DateInput source="dateOfInspection" />
    <DateInput source="commissionedAt" />
  </SimpleForm>
</Edit>
```

---

## 7. Summary — what is provided by the runtime (do NOT reimplement)

These behaviors are guaranteed by the generated backend and the shared frontend `dataProvider`. Do not duplicate them in controllers or UI code.

1. **Date normalization.** `NormalizeDatesInterceptor` converts any string in request body matching `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` to a full ISO-8601 timestamp before Prisma sees it.
2. **ValidationPipe.** Global `new ValidationPipe({ whitelist: true, transform: true })` strips unknown fields and runs `@Type(...)` coercion automatically.
3. **CORS.** `app.enableCors()` is set globally.
4. **Auth.** `@UseGuards(JwtAuthGuard)` must decorate every controller. JWT validation uses `KEYCLOAK_ISSUER_URL` and `KEYCLOAK_AUDIENCE` env vars.
5. **Pagination & sorting.** The frontend `dataProvider` always sends `skip`/`take`/`orderBy`/`where`. The backend is expected to pass them straight into Prisma. Don't reinterpret them.
