import { dslGrammar } from './grammar.ts';
import { offsetToLine } from './lineUtils.ts';
import type {
  Ast,
  ContainerNode,
  EntityNode,
  EnumNode,
  EnumValueNode,
  DtoNode,
  ApiNode,
  AttributeNode,
  EndpointNode,
  EndpointAttribute,
  Position,
} from './types.ts';

export interface ParseResult {
  ast: Ast;
  errors: { message: string; line: number }[];
}

const ENTITY_KEYWORDS = new Set([
  'entity', 'сущность', 'class', 'класс', 'table', 'таблица', 'model', 'модель',
]);
const ENUM_KEYWORDS = new Set(['enum', 'перечисление']);
const DTO_KEYWORDS = new Set(['dto', 'json']);
const API_KEYWORDS = new Set(['api']);

/** Stripped-down representation of a single Entity_* alternative. */
interface RawEntity {
  variant: string;            // 'Entity_options' | 'Entity_simple' | ...
  keyword: string;            // first child sourceString (trimmed)
  name: string;               // second-position name/ref/typeRef sourceString (when applicable)
  stringValue: string | null; // unquoted string literal (Entity_string)
  rawValue: string | null;    // raw sourceString for Entity_value / Entity_number
  items: RawEntity[];         // contents of the inner Block, if any
  position: Position;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Build a RawEntity from an Entity_* CST node. Variants differ only by the
 * arity/meaning of their children; we read the second child as `name`-ish, and
 * pick up a Block (if present) for nested items. Strings and value-keyword
 * payloads are captured separately.
 */
function makeRaw(node: any, variant: string, opts: {
  keyword: string;
  name: string;
  stringValue?: string | null;
  rawValue?: string | null;
  items?: RawEntity[];
}): RawEntity {
  return {
    variant,
    keyword: opts.keyword.trim(),
    name: opts.name.trim(),
    stringValue: opts.stringValue ?? null,
    rawValue: opts.rawValue ?? null,
    items: opts.items ?? [],
    position: { line: 0, offset: node.source.startIdx },
  };
}

let cachedSemantics: any = null;
function getSemantics(): any {
  if (cachedSemantics) return cachedSemantics;
  const semantics = (dslGrammar as any).createSemantics();

  semantics.addOperation('toRaw', {
    _iter(...children: any[]): RawEntity[] {
      return children.flatMap((c: any) => c.toRaw());
    },
    _nonterminal(...children: any[]): RawEntity[] {
      return children.flatMap((c: any) => c.toRaw());
    },
    _terminal(): RawEntity[] {
      return [];
    },

    Program(entities: any): RawEntity[] {
      return entities.toRaw();
    },
    Block(_open: any, items: any, _close: any): RawEntity[] {
      return items.toRaw();
    },
    Item(entity: any): RawEntity[] {
      return entity.toRaw();
    },

    Entity_options(this: any, kw: any, n: any, block: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_options', {
        keyword: kw.sourceString, name: n.sourceString, items: block.toRaw(),
      })];
    },
    Entity_simple(this: any, kw: any, n: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_simple', { keyword: kw.sourceString, name: n.sourceString })];
    },
    Entity_type(this: any, kw: any, t: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_type', { keyword: kw.sourceString, name: t.sourceString })];
    },
    Entity_typeOptions(this: any, kw: any, t: any, block: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_typeOptions', {
        keyword: kw.sourceString, name: t.sourceString, items: block.toRaw(),
      })];
    },
    Entity_string(this: any, kw: any, sv: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_string', {
        keyword: kw.sourceString, name: '', stringValue: unquote(sv.sourceString),
      })];
    },
    Entity_number(this: any, kw: any, nv: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_number', {
        keyword: kw.sourceString, name: '', rawValue: nv.sourceString,
      })];
    },
    Entity_value(this: any, kw: any, av: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_value', {
        keyword: kw.sourceString, name: '', rawValue: av.sourceString,
      })];
    },
    Entity_ref(this: any, kw: any, r: any, _arr: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_ref', { keyword: kw.sourceString, name: r.sourceString })];
    },
    Entity_refOptions(this: any, kw: any, r: any, _arr: any, block: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_refOptions', {
        keyword: kw.sourceString, name: r.sourceString, items: block.toRaw(),
      })];
    },
    Entity_translate(this: any, kw: any, t: any, _str: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_translate', { keyword: kw.sourceString, name: t.sourceString })];
    },
    Entity_condition(this: any, kw: any, r: any, _val: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_condition', { keyword: kw.sourceString, name: r.sourceString })];
    },
    Entity_annotation(this: any, kw: any, _n: any, _block: any, _semi: any): RawEntity[] {
      return [makeRaw(this, 'Entity_annotation', { keyword: kw.sourceString, name: '' })];
    },
    Entity_importRef(_kw: any, _r: any, _semi: any): RawEntity[] { return []; },
    Entity_importRefSelect(_kw: any, _r: any, _h: any, _n: any, _semi: any): RawEntity[] { return []; },
    Entity_importString(_kw: any, _s: any, _semi: any): RawEntity[] { return []; },
    Entity_importStringSelect(_kw: any, _s: any, _h: any, _n: any, _semi: any): RawEntity[] { return []; },
  });

  cachedSemantics = semantics;
  return semantics;
}

function pos(source: string, raw: RawEntity): Position {
  return { line: offsetToLine(source, raw.position.offset), offset: raw.position.offset };
}

function isAttributeKw(kw: string): boolean {
  return kw === 'attribute' || kw === 'реквизит';
}

function buildAttribute(raw: RawEntity, source: string): AttributeNode {
  const attr: AttributeNode = {
    name: raw.name,
    position: pos(source, raw),
    type: null,
    isPrimary: false,
    isRequired: false,
    isNullable: false,
    isUnique: false,
    isPrivate: false,
    defaultValue: null,
    description: null,
    label: null,
    mapTarget: null,
    syncTarget: null,
    foreignRelates: null,
  };

  for (const item of raw.items) {
    const v = item.variant;
    const kw = item.keyword;
    if (v === 'Entity_type' || v === 'Entity_typeOptions') {
      attr.type = item.name;
    } else if (v === 'Entity_simple') {
      if (kw === 'is' || kw === 'это') {
        if (item.name === 'required') attr.isRequired = true;
        else if (item.name === 'nullable') attr.isNullable = true;
        else if (item.name === 'unique') attr.isUnique = true;
        else if (item.name === 'private') attr.isPrivate = true;
      } else if ((kw === 'key' || kw === 'ключ') && item.name === 'primary') {
        attr.isPrimary = true;
      }
    } else if (v === 'Entity_options') {
      if ((kw === 'key' || kw === 'ключ') && item.name === 'foreign') {
        for (const inner of item.items) {
          if (inner.variant === 'Entity_ref' &&
              (inner.keyword === 'relates' || inner.keyword === 'относится')) {
            attr.foreignRelates = inner.name;
          }
        }
      } else if ((kw === 'key' || kw === 'ключ') && item.name === 'primary') {
        attr.isPrimary = true;
      }
    } else if (v === 'Entity_string') {
      if (kw === 'description' || kw === 'описание') attr.description = item.stringValue;
      else if (kw === 'label' || kw === 'заголовок') attr.label = item.stringValue;
    } else if (v === 'Entity_ref') {
      if (kw === 'map') attr.mapTarget = item.name;
      else if (kw === 'sync' || kw === 'обмен') attr.syncTarget = item.name;
    } else if (v === 'Entity_value') {
      if (kw === 'default') attr.defaultValue = item.rawValue;
    }
  }
  return attr;
}

function buildEnumValue(raw: RawEntity, source: string): EnumValueNode {
  let label: string | null = null;
  for (const item of raw.items) {
    if (item.variant === 'Entity_string' &&
        (item.keyword === 'label' || item.keyword === 'заголовок')) {
      label = item.stringValue;
    }
  }
  return { name: raw.name, position: pos(source, raw), label };
}

function buildEndpoint(raw: RawEntity, source: string): EndpointNode {
  const ep: EndpointNode = {
    name: raw.name,
    position: pos(source, raw),
    label: null,
    description: null,
    attributes: [],
  };
  for (const item of raw.items) {
    if (item.variant === 'Entity_string') {
      if (item.keyword === 'label' || item.keyword === 'заголовок') ep.label = item.stringValue;
      else if (item.keyword === 'description' || item.keyword === 'описание') ep.description = item.stringValue;
    } else if (isAttributeKw(item.keyword) &&
               (item.variant === 'Entity_options' || item.variant === 'Entity_simple')) {
      let type: string | null = null;
      for (const inner of item.items) {
        if (inner.variant === 'Entity_type' || inner.variant === 'Entity_typeOptions') {
          type = inner.name;
        }
      }
      ep.attributes.push({ name: item.name, position: pos(source, item), type });
    }
  }
  return ep;
}

function buildContainer(raw: RawEntity, source: string): ContainerNode | null {
  const kw = raw.keyword;
  const p = pos(source, raw);

  if (ENTITY_KEYWORDS.has(kw)) {
    const e: EntityNode = { kind: 'entity', name: raw.name, position: p, description: null, attributes: [] };
    for (const item of raw.items) {
      if (item.variant === 'Entity_string' && (item.keyword === 'description' || item.keyword === 'описание')) {
        e.description = item.stringValue;
      } else if (isAttributeKw(item.keyword) &&
                 (item.variant === 'Entity_options' || item.variant === 'Entity_simple')) {
        e.attributes.push(buildAttribute(item, source));
      }
    }
    return e;
  }

  if (ENUM_KEYWORDS.has(kw)) {
    const en: EnumNode = { kind: 'enum', name: raw.name, position: p, values: [] };
    for (const item of raw.items) {
      if ((item.keyword === 'value' || item.keyword === 'значение') &&
          (item.variant === 'Entity_options' || item.variant === 'Entity_simple')) {
        en.values.push(buildEnumValue(item, source));
      } else if ((item.keyword === 'value' || item.keyword === 'значение') &&
                 item.variant === 'Entity_value') {
        en.values.push({
          name: item.rawValue ?? '',
          position: pos(source, item),
          label: null,
        });
      }
    }
    return en;
  }

  if (DTO_KEYWORDS.has(kw)) {
    const dto: DtoNode = { kind: 'dto', name: raw.name, position: p, description: null, attributes: [] };
    for (const item of raw.items) {
      if (item.variant === 'Entity_string' && (item.keyword === 'description' || item.keyword === 'описание')) {
        dto.description = item.stringValue;
      } else if (isAttributeKw(item.keyword) &&
                 (item.variant === 'Entity_options' || item.variant === 'Entity_simple')) {
        dto.attributes.push(buildAttribute(item, source));
      }
    }
    return dto;
  }

  if (API_KEYWORDS.has(kw)) {
    const api: ApiNode = { kind: 'api', name: raw.name, position: p, description: null, endpoints: [] };
    for (const item of raw.items) {
      if (item.variant === 'Entity_string' && (item.keyword === 'description' || item.keyword === 'описание')) {
        api.description = item.stringValue;
      } else if (item.keyword === 'endpoint' &&
                 (item.variant === 'Entity_options' || item.variant === 'Entity_simple')) {
        api.endpoints.push(buildEndpoint(item, source));
      }
    }
    return api;
  }

  return null;
}

export function parseToAst(source: string): ParseResult {
  const errors: { message: string; line: number }[] = [];
  const ast: Ast = { source, containers: [] };

  if (!source || source.trim() === '') {
    return { ast, errors };
  }

  const match = (dslGrammar as any).match(source);
  if (match.failed()) {
    const failurePos = match.getRightmostFailurePosition();
    const expected = match.getExpectedText();
    errors.push({
      message: `Expected: ${expected}`,
      line: offsetToLine(source, failurePos),
    });
    return { ast, errors };
  }

  const semantics = getSemantics();
  const adapter = semantics(match);
  const rawTopLevel: RawEntity[] = adapter.toRaw();

  for (const raw of rawTopLevel) {
    const container = buildContainer(raw, source);
    if (container) ast.containers.push(container);
  }

  return { ast, errors };
}
