import { Injectable, BadRequestException } from '@nestjs/common';
import * as yaml from 'js-yaml';

interface OpenApiSchema {
  type?: string;
  format?: string;
  description?: string;
  nullable?: boolean;
  properties?: Record<string, any>;
  required?: string[];
  allOf?: any[];
  $ref?: string;
  items?: any;
  enum?: string[];
}

interface ConversionResult {
  dtoFiles: { name: string; content: string }[];
  apiContent: string;
  dtoCount: number;
  apiGroupCount: number;
}

@Injectable()
export class Openapi3ConverterService {
  private schemas: Record<string, OpenApiSchema> = {};
  private syntheticDtos: { group: string; content: string }[] = [];
  private currentGroup: string | null = null;

  convert(yamlContent: string): ConversionResult {
    let doc: any;
    try {
      doc = yaml.load(yamlContent);
    } catch (e) {
      throw new BadRequestException(
        'Failed to parse YAML: ' + (e as Error).message,
      );
    }

    this.schemas = doc?.components?.schemas ?? {};
    this.syntheticDtos = [];
    this.currentGroup = null;

    const paths: Record<string, any> = doc?.paths ?? {};
    const tags: { name: string; description?: string }[] = doc?.tags ?? [];

    const directSchemas = this.collectDirectSchemas(paths);
    const groups = this.groupSchemas(this.schemas);
    const dtoFiles = this.buildDtoFiles(groups, directSchemas);
    const { apiContent, apiGroupCount } = this.buildApiFile(
      paths,
      tags,
      dtoFiles.map((f) => f.name),
    );

    const totalDtos = dtoFiles.reduce((sum, f) => {
      const mainCount = groups[f.name]?.length ?? 0;
      const synCount = this.syntheticDtos.filter(
        (s) => s.group === f.name,
      ).length;
      return sum + mainCount + synCount;
    }, 0);

    return { dtoFiles, apiContent, dtoCount: totalDtos, apiGroupCount };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private escapeStr(s: string | undefined): string {
    if (!s) return '';
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .trim();
  }

  private indent(level: number): string {
    return '  '.repeat(level);
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Type resolution with synthetic DTO generation ───────────────────────

  private resolveType(prop: any, contextName: string): string {
    if (!prop) return 'string';

    if (prop.$ref) {
      return 'DTO.' + prop.$ref.replace('#/components/schemas/', '');
    }

    if (prop.allOf) {
      const hasInlineProps = prop.allOf.some((a: any) => a.properties);
      if (hasInlineProps) {
        const mergedProps: Record<string, any> = {};
        const mergedRequired: string[] = [];
        for (const part of prop.allOf) {
          if (part.$ref) {
            const refName = part.$ref.replace('#/components/schemas/', '');
            const refSchema = this.schemas[refName];
            if (refSchema?.properties) {
              Object.assign(mergedProps, refSchema.properties);
              if (refSchema.required)
                mergedRequired.push(...refSchema.required);
            }
          }
          if (part.properties) {
            Object.assign(mergedProps, part.properties);
            if (part.required) mergedRequired.push(...part.required);
          }
        }
        this.emitSyntheticDto(contextName, mergedProps, mergedRequired);
        return 'DTO.' + contextName;
      }
      const refItem = prop.allOf.find((a: any) => a.$ref);
      if (refItem)
        return 'DTO.' + refItem.$ref.replace('#/components/schemas/', '');
      return 'string';
    }

    if (prop.type === 'array') {
      if (prop.items) {
        const itemType = this.resolveType(prop.items, contextName + '_Item');
        return itemType + '[]';
      }
      return 'string[]';
    }

    if (prop.type === 'object' && prop.properties) {
      this.emitSyntheticDto(
        contextName,
        prop.properties,
        prop.required ?? [],
      );
      return 'DTO.' + contextName;
    }

    if (prop.type === 'object') return 'string';

    const fmt = prop.format;
    switch (prop.type) {
      case 'string':
        if (fmt === 'uuid') return 'uuid';
        if (fmt === 'date-time') return 'datetime';
        if (fmt === 'date') return 'date';
        return 'string';
      case 'integer':
        return 'integer';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'string';
    }
  }

  private emitSyntheticDto(
    synName: string,
    properties: Record<string, any>,
    requiredFields: string[],
  ): void {
    const lines: string[] = [];
    lines.push(`dto DTO.${synName} {`);
    lines.push(`${this.indent(1)}is dependent;`);

    for (const [propName, propDef] of Object.entries(properties)) {
      const propContext = this.capitalize(propName);
      lines.push(
        this.generateAttribute(propName, propDef, requiredFields, 1, propContext),
      );
    }

    lines.push('}');
    this.syntheticDtos.push({
      group: this.currentGroup!,
      content: lines.join('\n'),
    });
  }

  // ── Attribute generation ────────────────────────────────────────────────

  private generateAttribute(
    name: string,
    prop: any,
    requiredFields: string[] | undefined,
    level: number,
    contextName: string,
  ): string {
    const lines: string[] = [];
    const isRequired = requiredFields?.includes(name);
    const type = this.resolveType(prop, contextName);

    lines.push(`${this.indent(level)}attribute ${name} {`);
    lines.push(`${this.indent(level + 1)}type ${type};`);

    if (prop.description) {
      lines.push(
        `${this.indent(level + 1)}description "${this.escapeStr(prop.description)}";`,
      );
    }

    if (prop.nullable) {
      lines.push(`${this.indent(level + 1)}is nullable;`);
    } else if (isRequired && type.startsWith('DTO.')) {
      lines.push(`${this.indent(level + 1)}is required;`);
    }

    lines.push(`${this.indent(level)}}`);
    return lines.join('\n');
  }

  // ── Direct schemas ──────────────────────────────────────────────────────

  private collectDirectSchemas(paths: Record<string, any>): Set<string> {
    const direct = new Set<string>();
    for (const methods of Object.values(paths)) {
      for (const op of Object.values(methods as Record<string, any>)) {
        const reqJson = (op as any).requestBody?.content?.['application/json'];
        if (reqJson?.schema) {
          if (reqJson.schema.$ref)
            direct.add(
              reqJson.schema.$ref.replace('#/components/schemas/', ''),
            );
          else if (
            reqJson.schema.type === 'array' &&
            reqJson.schema.items?.$ref
          )
            direct.add(
              reqJson.schema.items.$ref.replace('#/components/schemas/', ''),
            );
        }
        const okResp =
          (op as any).responses?.['200'] ?? (op as any).responses?.['201'];
        const resJson = okResp?.content?.['application/json'];
        if (resJson?.schema) {
          if (resJson.schema.$ref)
            direct.add(
              resJson.schema.$ref.replace('#/components/schemas/', ''),
            );
          else if (
            resJson.schema.type === 'array' &&
            resJson.schema.items?.$ref
          )
            direct.add(
              resJson.schema.items.$ref.replace('#/components/schemas/', ''),
            );
        }
      }
    }
    return direct;
  }

  // ── DTO generation ──────────────────────────────────────────────────────

  private generateDto(
    schemaName: string,
    schema: OpenApiSchema,
    directSchemas: Set<string>,
  ): string {
    const lines: string[] = [];
    const dslName = 'DTO.' + schemaName;
    const isDependent = !directSchemas.has(schemaName);

    lines.push(`dto ${dslName} {`);

    if (isDependent) {
      lines.push(`${this.indent(1)}is dependent;`);
    }

    if (schema.description) {
      lines.push(
        `${this.indent(1)}description "${this.escapeStr(schema.description)}";`,
      );
    }

    const properties: Record<string, any> = { ...(schema.properties ?? {}) };
    const requiredFields: string[] = [...(schema.required ?? [])];

    if (schema.allOf) {
      for (const part of schema.allOf) {
        if (part.properties) {
          Object.assign(properties, part.properties);
          if (part.required) requiredFields.push(...part.required);
        }
        if (part.$ref) {
          const refName = part.$ref.replace('#/components/schemas/', '');
          const refSchema = this.schemas[refName];
          if (refSchema?.properties) {
            Object.assign(properties, refSchema.properties);
            if (refSchema.required) requiredFields.push(...refSchema.required);
          }
        }
      }
    }

    for (const [propName, propDef] of Object.entries(properties)) {
      const propContext = schemaName + '_' + this.capitalize(propName);
      lines.push(
        this.generateAttribute(propName, propDef, requiredFields, 1, propContext),
      );
    }

    lines.push('}');
    return lines.join('\n');
  }

  // ── Schema grouping ────────────────────────────────────────────────────

  private static readonly COMMON_SCHEMAS = new Set([
    'IdDto',
    'IdCodeDto',
    'IdCodeNamedDto',
    'IdNumberDto',
    'IdActiveCodeDto',
    'CodeDto',
    'PageInfo',
    'PageableObject',
    'SortObject',
    'Pageable',
    'Page',
    'SortOrder',
    'ResultDto',
    'ApiErrorDto',
    'ContactDto',
    'CommonDto',
    'ValidationResultDto',
    'StreamingResponseBody',
    'BaseIdFilter',
    'FilterWithPaging',
    'CommonIdFilter',
    'FilterWithPagingCommonIdFilter',
  ]);

  private static readonly SUFFIXES = [
    'CreationDto',
    'UpdateDto',
    'ShortDto',
    'DetailedDto',
    'PreviewDto',
    'MergeDto',
    'FactDto',
    'InputDto',
    'SyncDto',
    'Dto',
    'Filter',
    'Impl',
  ];

  private extractEntityStem(name: string): string {
    if (name.startsWith('FilterWithPaging'))
      name = name.replace('FilterWithPaging', '');
    if (
      /^Page[A-Z]/.test(name) &&
      !['PageInfo', 'PageableObject', 'Pageable'].includes(name)
    ) {
      name = name.replace(/^Page/, '');
    }
    for (const suffix of Openapi3ConverterService.SUFFIXES) {
      if (name.endsWith(suffix) && name.length > suffix.length) {
        return name.slice(0, -suffix.length);
      }
    }
    return name;
  }

  private getSchemaGroup(name: string): string {
    if (Openapi3ConverterService.COMMON_SCHEMAS.has(name)) return 'Common';
    if (name.startsWith('Search')) return 'SearchHelpers';
    return this.extractEntityStem(name);
  }

  private groupSchemas(
    schemas: Record<string, OpenApiSchema>,
  ): Record<string, { name: string; schema: OpenApiSchema }[]> {
    const groups: Record<string, { name: string; schema: OpenApiSchema }[]> =
      {};
    for (const [schemaName, schema] of Object.entries(schemas)) {
      const group = this.getSchemaGroup(schemaName);
      (groups[group] ??= []).push({ name: schemaName, schema });
    }
    return groups;
  }

  // ── Build DTO files ────────────────────────────────────────────────────

  private buildDtoFiles(
    groups: Record<string, { name: string; schema: OpenApiSchema }[]>,
    directSchemas: Set<string>,
  ): { name: string; content: string }[] {
    const groupParts: Record<string, string[]> = {};

    for (const [group, schemaList] of Object.entries(groups)) {
      this.currentGroup = group;

      const parts = [
        `// ==========================================`,
        `// ${group}`,
        `// ==========================================`,
        '',
      ];

      for (const { name, schema } of schemaList) {
        parts.push(this.generateDto(name, schema, directSchemas), '');
      }

      groupParts[group] = parts;
    }

    for (const { group, content } of this.syntheticDtos) {
      if (groupParts[group]) {
        groupParts[group].push(content, '');
      }
    }

    return Object.entries(groupParts).map(([group, parts]) => ({
      name: group,
      content: parts.join('\n'),
    }));
  }

  // ── Build API file ─────────────────────────────────────────────────────

  private buildEndpoint(
    method: string,
    pathStr: string,
    op: any,
  ): {
    endpointName: string;
    method: string;
    path: string;
    description: string;
    pathParams: any[];
    requestSchema: string | null;
    requestIsArray: boolean;
    responseSchema: string | null;
    responseIsArray: boolean;
  } {
    let endpointName: string = op.operationId;
    if (
      !endpointName ||
      /^(findById|getPage|get|post|put|delete)_\d+$/.test(endpointName)
    ) {
      const segments = pathStr
        .replace(/\{[^}]+\}/g, '')
        .split('/')
        .filter(Boolean)
        .map((s: string) =>
          s.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase()),
        );
      endpointName =
        method.toLowerCase() +
        segments
          .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
          .join('');
    }

    const pathParams = (op.parameters ?? []).filter(
      (p: any) => p.in === 'path',
    );

    let requestSchema: string | null = null;
    let requestIsArray = false;
    const reqJson = op.requestBody?.content?.['application/json'];
    if (reqJson?.schema) {
      if (reqJson.schema.$ref) {
        requestSchema = reqJson.schema.$ref.replace(
          '#/components/schemas/',
          '',
        );
      } else if (
        reqJson.schema.type === 'array' &&
        reqJson.schema.items?.$ref
      ) {
        requestSchema = reqJson.schema.items.$ref.replace(
          '#/components/schemas/',
          '',
        );
        requestIsArray = true;
      }
    }

    let responseSchema: string | null = null;
    let responseIsArray = false;
    const okResp = op.responses?.['200'] ?? op.responses?.['201'];
    const resJson = okResp?.content?.['application/json'];
    if (resJson?.schema) {
      if (resJson.schema.$ref) {
        responseSchema = resJson.schema.$ref.replace(
          '#/components/schemas/',
          '',
        );
      } else if (
        resJson.schema.type === 'array' &&
        resJson.schema.items?.$ref
      ) {
        responseSchema = resJson.schema.items.$ref.replace(
          '#/components/schemas/',
          '',
        );
        responseIsArray = true;
      }
    }

    const rawDesc: string = op.summary ?? op.description ?? '';
    const description = rawDesc
      .replace(/\n/g, ' ')
      .replace(/\*\*.*?\*\*/g, '')
      .replace(/- `.*?`/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      endpointName,
      method: method.toUpperCase(),
      path: pathStr,
      description,
      pathParams,
      requestSchema,
      requestIsArray,
      responseSchema,
      responseIsArray,
    };
  }

  private buildApiFile(
    paths: Record<string, any>,
    tags: { name: string; description?: string }[],
    dtoFileNames: string[],
  ): { apiContent: string; apiGroupCount: number } {
    const apiGroups: Record<string, ReturnType<typeof this.buildEndpoint>[]> =
      {};
    for (const [pathStr, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(
        methods as Record<string, any>,
      )) {
        const tag = ((operation as any).tags ?? ['default'])[0];
        (apiGroups[tag] ??= []).push(
          this.buildEndpoint(method, pathStr, operation),
        );
      }
    }

    const tagDescriptions = Object.fromEntries(
      tags.map((t) => [t.name, t.description ?? t.name]),
    );

    const tagToApiName = (tag: string) =>
      'API.' +
      tag
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');

    const apiParts: string[] = [];

    for (const fileName of [...dtoFileNames].sort()) {
      apiParts.push(`//import ./dto/${fileName};`);
    }
    apiParts.push('');

    for (const [tag, endpoints] of Object.entries(apiGroups)) {
      const apiName = tagToApiName(tag);
      const desc = tagDescriptions[tag] ?? tag;

      apiParts.push(`// ==========================================`);
      apiParts.push(`// ${desc}`);
      apiParts.push(`// ==========================================`);
      apiParts.push('');
      apiParts.push(`api ${apiName} {`);
      apiParts.push(`  description "${this.escapeStr(desc)}";`);
      apiParts.push('');

      for (const ep of endpoints) {
        apiParts.push(`  endpoint ${ep.endpointName} {`);
        apiParts.push(`    label "${ep.method} ${ep.path}";`);
        if (ep.description)
          apiParts.push(
            `    description "${this.escapeStr(ep.description)}";`,
          );

        for (const p of ep.pathParams) {
          const pType = p.schema?.format === 'uuid' ? 'uuid' : 'string';
          apiParts.push(`    attribute ${p.name} {`);
          apiParts.push(`      type ${pType};`);
          apiParts.push(`    }`);
        }

        if (ep.requestSchema) {
          const t = ep.requestIsArray
            ? `DTO.${ep.requestSchema}[]`
            : `DTO.${ep.requestSchema}`;
          apiParts.push(`    attribute request {`);
          apiParts.push(`      type ${t};`);
          apiParts.push(`    }`);
        }

        if (ep.responseSchema) {
          const t = ep.responseIsArray
            ? `DTO.${ep.responseSchema}[]`
            : `DTO.${ep.responseSchema}`;
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

    return {
      apiContent: apiParts.join('\n'),
      apiGroupCount: Object.keys(apiGroups).length,
    };
  }
}
