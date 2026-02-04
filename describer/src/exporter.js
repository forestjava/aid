import { writeFile, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { config, validateConfig } from './config.js';
import { testConnection, closePool } from './db.js';
import { getTablesList, getFullTableInfo } from './queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Создание директории для вывода если не существует
 * @param {string} outputDir - Путь к директории
 */
async function ensureOutputDir(outputDir) {
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
    console.log(`✓ Создана директория: ${outputDir}`);
  }
}

/**
 * Сохранение данных таблицы в JSON файл
 * @param {Object} tableData - Данные таблицы
 * @param {string} outputDir - Директория для сохранения
 */
async function saveTableToJSON(tableData, outputDir) {
  const fileName = `${tableData.table_name}.json`;
  const filePath = join(outputDir, fileName);
  
  const jsonContent = JSON.stringify(tableData, null, 2);
  await writeFile(filePath, jsonContent, 'utf-8');
  
  return filePath;
}

/**
 * Экспорт всей схемы PostgreSQL в JSON файлы
 */
export async function exportSchema() {
  console.log('='.repeat(60));
  console.log('PostgreSQL → JSON Exporter v1.0');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. Валидация конфигурации
    console.log('1. Проверка конфигурации...');
    validateConfig();
    console.log(`✓ Конфигурация корректна`);
    console.log(`  БД: ${config.db.database}`);
    console.log(`  Схема: ${config.db.schema}`);
    console.log('');

    // 2. Тестирование подключения
    console.log('2. Подключение к БД...');
    await testConnection();
    console.log('');

    // 3. Подготовка директории для вывода
    console.log('3. Подготовка директории вывода...');
    const outputDir = resolve(__dirname, config.output.dir);
    await ensureOutputDir(outputDir);
    console.log(`✓ Директория вывода: ${outputDir}`);
    console.log('');

    // 4. Получение списка таблиц
    console.log('4. Получение списка таблиц...');
    const tables = await getTablesList();
    console.log(`✓ Найдено таблиц: ${tables.length}`);
    console.log('');

    if (tables.length === 0) {
      console.log('⚠ В схеме нет таблиц для экспорта');
      return;
    }

    // 5. Экспорт каждой таблицы
    console.log('5. Экспорт таблиц...');
    console.log('-'.repeat(60));

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i];
      const progress = `[${i + 1}/${tables.length}]`;

      try {
        process.stdout.write(`${progress} ${tableName}... `);

        // Получение метаданных таблицы
        const tableData = await getFullTableInfo(tableName);

        // Сохранение в JSON
        await saveTableToJSON(tableData, outputDir);

        console.log(`✓ (${tableData.columns.length} колонок)`);
        successCount++;
      } catch (err) {
        console.log(`✗ ОШИБКА`);
        errorCount++;
        errors.push({ table: tableName, error: err.message });
      }
    }

    // 6. Итоговая статистика
    console.log('-'.repeat(60));
    console.log('');
    console.log('6. Итоги экспорта:');
    console.log(`✓ Успешно экспортировано: ${successCount} таблиц`);
    
    if (errorCount > 0) {
      console.log(`✗ Ошибок: ${errorCount}`);
      console.log('');
      console.log('Таблицы с ошибками:');
      errors.forEach(({ table, error }) => {
        console.log(`  - ${table}: ${error}`);
      });
    }

    console.log('');
    console.log(`Файлы сохранены в: ${outputDir}`);
    console.log('');
    console.log('='.repeat(60));
    console.log('Экспорт завершен');
    console.log('='.repeat(60));

  } catch (err) {
    console.error('');
    console.error('✗ КРИТИЧЕСКАЯ ОШИБКА:');
    console.error(err.message);
    console.error('');
    throw err;
  } finally {
    // Закрытие соединений с БД
    await closePool();
  }
}
