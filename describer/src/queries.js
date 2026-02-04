import { getPool } from './db.js';
import { config } from './config.js';

/**
 * Получение списка всех таблиц из схемы
 * @returns {Promise<Array<string>>} Массив имен таблиц
 */
export async function getTablesList() {
  const query = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  const result = await getPool().query(query, [config.db.schema]);
  return result.rows.map(row => row.table_name);
}

/**
 * Получение комментария к таблице
 * @param {string} tableName - Имя таблицы
 * @returns {Promise<string|null>} Комментарий к таблице или null
 */
export async function getTableComment(tableName) {
  const query = `
    SELECT obj_description(
      (quote_ident($1) || '.' || quote_ident($2))::regclass,
      'pg_class'
    ) AS table_comment;
  `;

  const result = await getPool().query(query, [config.db.schema, tableName]);
  return result.rows[0]?.table_comment || null;
}

/**
 * Получение полной информации о колонках таблицы
 * Включает типы, nullable, default, PK, FK, комментарии
 * @param {string} tableName - Имя таблицы
 * @returns {Promise<Array>} Массив объектов с информацией о колонках
 */
export async function getTableMetadata(tableName) {
  const query = `
    SELECT 
      c.column_name,
      c.ordinal_position,
      c.data_type,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_nullable,
      c.column_default,
      col_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass, 
        c.ordinal_position
      ) AS column_comment,
      CASE WHEN pk.column_name IS NOT NULL THEN 'PK' END AS is_pk,
      fk.foreign_table_name,
      fk.foreign_column_name,
      fk.constraint_name AS fk_constraint_name
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT kcu.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' 
        AND tc.table_schema = $1
    ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
    LEFT JOIN (
      SELECT 
        kcu.table_name, 
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = $1
    ) fk ON c.table_name = fk.table_name AND c.column_name = fk.column_name
    WHERE c.table_schema = $1
      AND c.table_name = $2
    ORDER BY c.ordinal_position;
  `;

  const result = await getPool().query(query, [config.db.schema, tableName]);
  return result.rows;
}

/**
 * Получение полной информации о таблице
 * @param {string} tableName - Имя таблицы
 * @returns {Promise<Object>} Объект с полной информацией о таблице
 */
export async function getFullTableInfo(tableName) {
  const [tableComment, columns] = await Promise.all([
    getTableComment(tableName),
    getTableMetadata(tableName),
  ]);

  return {
    schema: config.db.schema,
    table_name: tableName,
    table_comment: tableComment,
    columns: columns,
  };
}
