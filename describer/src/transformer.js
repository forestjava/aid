/**
 * Модуль трансформации данных PostgreSQL в DSL формат
 */

/**
 * Маппинг типов PostgreSQL → DSL (один идентификатор)
 */
const TYPE_MAP = {
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamptz',
  'time without time zone': 'time',
  'time with time zone': 'timetz',
  'character varying': 'varchar',
  'character': 'char',
  'double precision': 'double',
  'bit varying': 'varbit',
};

/**
 * Преобразование типа PostgreSQL в DSL идентификатор
 * @param {string} pgType - Тип данных из PostgreSQL
 * @returns {string} Тип данных в формате DSL
 */
export function mapDataType(pgType) {
  const mapped = TYPE_MAP[pgType] || pgType;
  // Заменяем дефисы на подчёркивания (DSL не поддерживает дефисы в идентификаторах)
  return mapped.replace(/-/g, '_');
}

/**
 * Форматирование типа данных с ограничениями
 * @param {Object} column - Данные колонки из JSON
 * @returns {string} Тип данных в формате DSL с ограничениями
 */
export function formatType(column) {
  const baseType = mapDataType(column.data_type);
  
  // Добавляем ограничения длины для varchar/char
  if (column.character_maximum_length !== null) {
    return `${baseType}(${column.character_maximum_length})`;
  }
  
  // Добавляем precision и scale для numeric/decimal
  if (column.numeric_precision !== null && column.data_type === 'numeric') {
    if (column.numeric_scale !== null && column.numeric_scale !== 0) {
      return `${baseType}(${column.numeric_precision},${column.numeric_scale})`;
    }
    return `${baseType}(${column.numeric_precision})`;
  }
  
  return baseType;
}

/**
 * Экранирование строки для DSL
 * @param {string} str - Исходная строка
 * @returns {string} Экранированная строка
 */
function escapeString(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Генерация блока attribute для одной колонки
 * @param {Object} column - Данные колонки из JSON
 * @param {string} schema - Имя схемы БД
 * @returns {string} DSL блок attribute
 */
export function formatAttribute(column, schema) {
  const lines = [];
  
  // Открытие блока attribute
  lines.push(`  attribute ${column.column_name} {`);
  
  // description из column_comment
  if (column.column_comment) {
    lines.push(`    description "${escapeString(column.column_comment)}";`);
  }
  
  // type
  lines.push(`    type ${formatType(column)};`);
  
  // is required (NOT NULL)
  if (column.is_nullable === 'NO') {
    lines.push(`    is required;`);
  }
  
  // key primary
  if (column.is_pk === 'PK') {
    lines.push(`    key primary;`);
  }
  
  // key foreign
  if (column.foreign_table_name) {
    lines.push(`    key foreign {`);
    lines.push(`      attribute ${schema}.${column.foreign_table_name}.${column.foreign_column_name};`);
    lines.push(`    }`);
  }
  
  // Закрытие блока attribute
  lines.push(`  }`);
  
  return lines.join('\n');
}

/**
 * Генерация полного DSL файла для таблицы
 * @param {Object} tableData - Данные таблицы из JSON
 * @returns {string} Содержимое DSL файла
 */
export function generateDSL(tableData) {
  const lines = [];
  
  // Открытие таблицы
  lines.push(`table ${tableData.schema}.${tableData.table_name} {`);
  
  // label из table_comment
  if (tableData.table_comment) {
    lines.push(`  label "${escapeString(tableData.table_comment)}";`);
  }
  
  // Пустая строка после заголовка
  lines.push('');
  
  // Генерация атрибутов
  const attributes = tableData.columns.map(col => 
    formatAttribute(col, tableData.schema)
  );
  
  lines.push(attributes.join('\n\n'));
  
  // Закрытие таблицы
  lines.push('}');
  
  return lines.join('\n') + '\n';
}

/**
 * Трансформация данных таблицы в DSL формат
 * @param {Object} tableData - Данные таблицы из PostgreSQL (JSON)
 * @returns {string} DSL представление таблицы
 */
export function transformToDSL(tableData) {
  return generateDSL(tableData);
}
