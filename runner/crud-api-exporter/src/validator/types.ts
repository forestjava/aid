export interface Position {
  line: number;
  offset: number;
}

export interface AttributeNode {
  name: string;
  position: Position;
  type: string | null;          // 'string' | 'uuid' | 'datetime' | 'EntityName' | 'EnumName' | 'EntityName[]' | null
  isPrimary: boolean;
  isRequired: boolean;
  isNullable: boolean;
  isUnique: boolean;
  isPrivate: boolean;
  defaultValue: string | null;
  description: string | null;
  label: string | null;
  mapTarget: string | null;     // 'Entity.field'
  syncTarget: string | null;
  foreignRelates: string | null; // 'Entity.field' внутри key foreign { relates ... }
}

export interface EntityNode {
  kind: 'entity';
  name: string;
  position: Position;
  description: string | null;
  attributes: AttributeNode[];
}

export interface EnumValueNode {
  name: string;
  position: Position;
  label: string | null;
}

export interface EnumNode {
  kind: 'enum';
  name: string;
  position: Position;
  values: EnumValueNode[];
}

export interface DtoNode {
  kind: 'dto';
  name: string;                  // 'DTO.Equipment'
  position: Position;
  description: string | null;
  attributes: AttributeNode[];
}

export interface EndpointAttribute {
  name: string;                  // 'request' | 'response' | 'id' | ...
  position: Position;
  type: string | null;
}

export interface EndpointNode {
  name: string;
  position: Position;
  label: string | null;          // 'POST /equipment/page'
  description: string | null;
  attributes: EndpointAttribute[];
}

export interface ApiNode {
  kind: 'api';
  name: string;                  // 'API.Equipment'
  position: Position;
  description: string | null;
  endpoints: EndpointNode[];
}

export type ContainerNode = EntityNode | EnumNode | DtoNode | ApiNode;

export interface Ast {
  source: string;
  containers: ContainerNode[];
}

export interface Issue {
  rule: string;                  // 'R1', 'O3', etc
  entity?: string;
  attribute?: string;
  line: number;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
}

export interface Rule {
  id: string;
  check(ast: Ast): Issue[];
}

export interface OutputRule {
  id: string;
  check(input: Ast, output: Ast): Issue[];
}
