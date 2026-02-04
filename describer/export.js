#!/usr/bin/env node

/**
 * Точка входа для экспорта схемы PostgreSQL в JSON
 * 
 * Использование:
 *   node export.js
 *   npm run export
 */

import { exportSchema } from './src/exporter.js';

exportSchema()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Экспорт завершился с ошибкой\n');
    process.exit(1);
  });
