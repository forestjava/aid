#!/usr/bin/env node

/**
 * Точка входа для трансформации JSON → DSL
 * 
 * Использование:
 *   node transform.js
 *   npm run transform
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { transformToDSL } from './src/transformer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Пути по умолчанию (относительно describer/)
const DEFAULT_INPUT_DIR = './data/ALIS/generated';
const DEFAULT_OUTPUT_DIR = './data/ALIS/db';

/**
 * Создание директории если не существует
 */
async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
    console.log(`✓ Создана директория: ${dir}`);
  }
}

/**
 * Трансформация всех JSON файлов в DSL
 */
async function transformAll() {
  console.log('='.repeat(60));
  console.log('JSON → DSL Transformer v1.0');
  console.log('='.repeat(60));
  console.log('');

  const inputDir = resolve(__dirname, DEFAULT_INPUT_DIR);
  const outputDir = resolve(__dirname, DEFAULT_OUTPUT_DIR);

  // Проверяем входную директорию
  if (!existsSync(inputDir)) {
    console.error(`✗ Директория не найдена: ${inputDir}`);
    console.error('  Сначала выполните: npm run export');
    process.exit(1);
  }

  // Создаём выходную директорию
  await ensureDir(outputDir);

  console.log(`Источник:    ${inputDir}`);
  console.log(`Назначение:  ${outputDir}`);
  console.log('');

  // Получаем список JSON файлов
  const files = (await readdir(inputDir))
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('⚠ Нет JSON файлов для трансформации');
    return;
  }

  console.log(`Найдено JSON файлов: ${files.length}`);
  console.log('-'.repeat(60));

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const tableName = fileName.replace('.json', '');
    const progress = `[${i + 1}/${files.length}]`;

    try {
      process.stdout.write(`${progress} ${tableName}... `);

      // Читаем JSON
      const jsonPath = join(inputDir, fileName);
      const jsonContent = await readFile(jsonPath, 'utf-8');
      const tableData = JSON.parse(jsonContent);

      // Трансформируем в DSL
      const dslContent = transformToDSL(tableData);

      // Сохраняем DSL (без расширения)
      const dslPath = join(outputDir, tableName);
      await writeFile(dslPath, dslContent, 'utf-8');

      console.log(`✓ (${tableData.columns.length} атрибутов)`);
      successCount++;
    } catch (err) {
      console.log(`✗ ОШИБКА: ${err.message}`);
      errorCount++;
      errors.push({ table: tableName, error: err.message });
    }
  }

  // Итоги
  console.log('-'.repeat(60));
  console.log('');
  console.log('Итоги трансформации:');
  console.log(`✓ Успешно: ${successCount} таблиц`);

  if (errorCount > 0) {
    console.log(`✗ Ошибок: ${errorCount}`);
    console.log('');
    console.log('Таблицы с ошибками:');
    errors.forEach(({ table, error }) => {
      console.log(`  - ${table}: ${error}`);
    });
  }

  console.log('');
  console.log(`DSL файлы сохранены в: ${outputDir}`);
  console.log('');
  console.log('='.repeat(60));
  console.log('Трансформация завершена');
  console.log('='.repeat(60));
}

// Запуск
transformAll()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n✗ Критическая ошибка:', err.message);
    process.exit(1);
  });
