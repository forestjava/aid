/**
 * OpenAPI 3.x YAML → AID DSL converter
 *
 * Usage:
 *   node openapi2dsl.js <input.yaml> <output-dir>
 *
 * Example:
 *   node openapi2dsl.js ../data/Unknowns/openapi3.yaml ../data/Unknowns
 *
 * Result:
 *   <output-dir>/api        — API file with endpoint definitions and imports
 *   <output-dir>/dto/       — Directory with DTO files grouped by entity
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let yaml;
try {
  yaml = require('js-yaml');
} catch {
  console.error('js-yaml not found. Run: npm install js-yaml');
  process.exit(1);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const [,, inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('Usage: node openapi2dsl.js <input.yaml> <output-dir>');
  process.exit(1);
}

const inputFile = resolve(inputArg);
const outputDir = resolve(outputArg);
const dtoDir   = join(outputDir, 'dto');
const apiFile  = join(outputDir, 'api');

const doc     = yaml.load(readFileSync(inputFile, 'utf8'));
const schemas = doc.components?.schemas ?? {};
const paths   = doc.paths ?? {};
const tags    = doc.tags ?? [];

rmSync(dtoDir, { recursive: true, force: true });
mkdirSync(dtoDir, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeStr(s) {
  if (!s) return '';
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function indent(level) {
  return '  '.repeat(level);
}

// ── Type mapping ─────────────────────────────────────────────────────────────

function mapType(prop) {
  if (!prop) return 'string';

  if (prop.$ref) {
    return 'DTO.' + prop.$ref.replace('#/components/schemas/', '');
  }

  if (prop.allOf) {
    const refItem = prop.allOf.find(a => a.$ref);
    if (refItem) return 'DTO.' + refItem.$ref.replace('#/components/schemas/', '');
    return 'string';
  }

  if (prop.type === 'array') {
    if (prop.items) {
      const itemType = mapType(prop.items);
      if (itemType === null) return 'string[]'; // inline object array
      return itemType + '[]';
    }
    return 'string[]';
  }

  if (prop.type === 'object' && !prop.properties) return 'string';
  if (prop.type === 'object' && prop.properties)  return null; // inline object

  const fmt = prop.format;
  switch (prop.type) {
    case 'string':
      if (fmt === 'uuid') return 'uuid';
      if (fmt === 'date-time') return 'datetime';
      if (fmt === 'date') return 'date';
      return 'string';
    case 'integer': return 'integer';
    case 'number':  return 'number';
    case 'boolean': return 'boolean';
    default:        return 'string';
  }
}

// ── Attribute generation ─────────────────────────────────────────────────────

function generateAttribute(name, prop, requiredFields, level) {
  const lines = [];
  const isRequired = requiredFields?.includes(name);
  let type = mapType(prop);

  if (type === null) {
    // inline object → fallback to string
    type = 'string';
  }

  lines.push(`${indent(level)}attribute ${name} {`);
  lines.push(`${indent(level + 1)}type ${type};`);

  if (prop.description) {
    lines.push(`${indent(level + 1)}description "${escapeStr(prop.description)}";`);
  }

  if (prop.nullable) {
    lines.push(`${indent(level + 1)}is nullable;`);
  } else if (isRequired && type.startsWith('DTO.')) {
    lines.push(`${indent(level + 1)}is required;`);
  }

  lines.push(`${indent(level)}}`);
  return lines.join('\n');
}

// ── Collect schemas directly used as request/response in endpoints ────────────

const directSchemas = new Set();
for (const methods of Object.values(paths)) {
  for (const op of Object.values(methods)) {
    const reqJson = op.requestBody?.content?.['application/json'];
    if (reqJson?.schema) {
      if (reqJson.schema.$ref)
        directSchemas.add(reqJson.schema.$ref.replace('#/components/schemas/', ''));
      else if (reqJson.schema.type === 'array' && reqJson.schema.items?.$ref)
        directSchemas.add(reqJson.schema.items.$ref.replace('#/components/schemas/', ''));
    }
    const okResp = op.responses?.['200'] ?? op.responses?.['201'];
    const resJson = okResp?.content?.['application/json'];
    if (resJson?.schema) {
      if (resJson.schema.$ref)
        directSchemas.add(resJson.schema.$ref.replace('#/components/schemas/', ''));
      else if (resJson.schema.type === 'array' && resJson.schema.items?.$ref)
        directSchemas.add(resJson.schema.items.$ref.replace('#/components/schemas/', ''));
    }
  }
}

// ── DTO generation ───────────────────────────────────────────────────────────

function generateDto(schemaName, schema) {
  const lines = [];
  const dslName = 'DTO.' + schemaName;
  const isDependent = !directSchemas.has(schemaName);

  lines.push(`dto ${dslName} {`);

  if (isDependent) {
    lines.push(`${indent(1)}is dependent;`);
  }

  if (schema.description) {
    lines.push(`${indent(1)}description "${escapeStr(schema.description)}";`);
  }

  const properties    = { ...(schema.properties ?? {}) };
  const requiredFields = [...(schema.required ?? [])];

  // Merge allOf parts
  if (schema.allOf) {
    for (const part of schema.allOf) {
      if (part.properties) {
        Object.assign(properties, part.properties);
        if (part.required) requiredFields.push(...part.required);
      }
      if (part.$ref) {
        const refName = part.$ref.replace('#/components/schemas/', '');
        const refSchema = schemas[refName];
        if (refSchema?.properties) {
          Object.assign(properties, refSchema.properties);
          if (refSchema.required) requiredFields.push(...refSchema.required);
        }
      }
    }
  }

  for (const [propName, propDef] of Object.entries(properties)) {
    lines.push(generateAttribute(propName, propDef, requiredFields, 1));
  }

  lines.push('}');
  return lines.join('\n');
}

// ── Schema grouping ──────────────────────────────────────────────────────────

function extractEntityStem(name) {
  if (name.startsWith('FilterWithPaging')) name = name.replace('FilterWithPaging', '');
  if (/^Page[A-Z]/.test(name) && !['PageInfo', 'PageableObject', 'Pageable'].includes(name)) {
    name = name.replace(/^Page/, '');
  }
  const suffixes = [
    'CreationDto', 'UpdateDto', 'ShortDto', 'DetailedDto', 'PreviewDto',
    'MergeDto', 'FactDto', 'InputDto', 'SyncDto',
    'Dto', 'Filter', 'Impl',
  ];
  for (const suffix of suffixes) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      return name.slice(0, -suffix.length);
    }
  }
  return name;
}

const COMMON_SCHEMAS = new Set([
  'IdDto', 'IdCodeDto', 'IdCodeNamedDto', 'IdNumberDto', 'IdActiveCodeDto', 'CodeDto',
  'PageInfo', 'PageableObject', 'SortObject', 'Pageable', 'Page', 'SortOrder',
  'ResultDto', 'ApiErrorDto', 'ContactDto', 'CommonDto', 'ValidationResultDto',
  'StreamingResponseBody',
  'BaseIdFilter', 'FilterWithPaging', 'CommonIdFilter', 'FilterWithPagingCommonIdFilter',
]);

function getSchemaGroup(name) {
  if (COMMON_SCHEMAS.has(name)) return 'Common';
  if (name.startsWith('Search'))  return 'SearchHelpers';
  return extractEntityStem(name);
}

// ── Build groups ─────────────────────────────────────────────────────────────

const groups = {};
for (const [schemaName, schema] of Object.entries(schemas)) {
  const group = getSchemaGroup(schemaName);
  (groups[group] ??= []).push({ name: schemaName, schema });
}

// ── Write DTO files ──────────────────────────────────────────────────────────

const dtoFiles = [];
for (const [group, schemaList] of Object.entries(groups)) {
  const fileName = group;
  dtoFiles.push(fileName);

  const parts = [
    `// ==========================================`,
    `// ${group}`,
    `// ==========================================`,
    '',
  ];

  for (const { name, schema } of schemaList) {
    parts.push(generateDto(name, schema), '');
  }

  writeFileSync(join(dtoDir, fileName), parts.join('\n'));
  console.log(`  dto/${fileName}  (${schemaList.length} DTOs)`);
}

// ── Build API file ───────────────────────────────────────────────────────────

const apiGroups = {};
for (const [pathStr, methods] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    const tag = (operation.tags ?? ['default'])[0];
    (apiGroups[tag] ??= []).push(buildEndpoint(method, pathStr, operation));
  }
}

function buildEndpoint(method, pathStr, op) {
  let endpointName = op.operationId;
  if (!endpointName || /^(findById|getPage|get|post|put|delete)_\d+$/.test(endpointName)) {
    const segments = pathStr
      .replace(/\{[^}]+\}/g, '')
      .split('/').filter(Boolean)
      .map(s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
    endpointName = method.toLowerCase() +
      segments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  }

  const pathParams = (op.parameters ?? []).filter(p => p.in === 'path');

  let requestSchema = null, requestIsArray = false;
  const reqJson = op.requestBody?.content?.['application/json'];
  if (reqJson?.schema) {
    if (reqJson.schema.$ref) {
      requestSchema = reqJson.schema.$ref.replace('#/components/schemas/', '');
    } else if (reqJson.schema.type === 'array' && reqJson.schema.items?.$ref) {
      requestSchema = reqJson.schema.items.$ref.replace('#/components/schemas/', '');
      requestIsArray = true;
    }
  }

  let responseSchema = null, responseIsArray = false;
  const okResp = op.responses?.['200'] ?? op.responses?.['201'];
  const resJson = okResp?.content?.['application/json'];
  if (resJson?.schema) {
    if (resJson.schema.$ref) {
      responseSchema = resJson.schema.$ref.replace('#/components/schemas/', '');
    } else if (resJson.schema.type === 'array' && resJson.schema.items?.$ref) {
      responseSchema = resJson.schema.items.$ref.replace('#/components/schemas/', '');
      responseIsArray = true;
    }
  }

  const rawDesc = op.summary ?? op.description ?? '';
  const description = rawDesc
    .replace(/\n/g, ' ')
    .replace(/\*\*.*?\*\*/g, '')
    .replace(/- `.*?`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    endpointName, method: method.toUpperCase(), path: pathStr,
    description, pathParams,
    requestSchema, requestIsArray,
    responseSchema, responseIsArray,
  };
}

const tagDescriptions = Object.fromEntries(tags.map(t => [t.name, t.description ?? t.name]));

function tagToApiName(tag) {
  return 'API.' + tag.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

const apiParts = [];

for (const fileName of dtoFiles.sort()) {
  apiParts.push(`import ./dto/${fileName};`);
}
apiParts.push('');

for (const [tag, endpoints] of Object.entries(apiGroups)) {
  const apiName = tagToApiName(tag);
  const desc    = tagDescriptions[tag] ?? tag;

  apiParts.push(`// ==========================================`);
  apiParts.push(`// ${desc}`);
  apiParts.push(`// ==========================================`);
  apiParts.push('');
  apiParts.push(`api ${apiName} {`);
  apiParts.push(`  description "${escapeStr(desc)}";`);
  apiParts.push('');

  for (const ep of endpoints) {
    apiParts.push(`  endpoint ${ep.endpointName} {`);
    apiParts.push(`    label "${ep.method} ${ep.path}";`);
    if (ep.description) apiParts.push(`    description "${escapeStr(ep.description)}";`);

    for (const p of ep.pathParams) {
      const pType = p.schema?.format === 'uuid' ? 'uuid' : 'string';
      apiParts.push(`    attribute ${p.name} {`);
      apiParts.push(`      type ${pType};`);
      apiParts.push(`    }`);
    }

    if (ep.requestSchema) {
      const t = ep.requestIsArray ? `DTO.${ep.requestSchema}[]` : `DTO.${ep.requestSchema}`;
      apiParts.push(`    attribute request {`);
      apiParts.push(`      type ${t};`);
      apiParts.push(`    }`);
    }

    if (ep.responseSchema) {
      const t = ep.responseIsArray ? `DTO.${ep.responseSchema}[]` : `DTO.${ep.responseSchema}`;
      apiParts.push(`    attribute response {`);
      apiParts.push(`      type ${t};`);
      apiParts.push(`    }`);
    }

    apiParts.push(`  }`);
    apiParts.push('');
  }

  apiParts.push('}');
  apiParts.push('');
}

writeFileSync(apiFile, apiParts.join('\n'));
console.log(`\n  api  (${Object.keys(apiGroups).length} API groups)`);
console.log(`\nDone: ${dtoFiles.length} DTO files + 1 API file → ${outputDir}`);
