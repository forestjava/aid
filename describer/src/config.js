import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Получаем путь к текущему файлу для правильного разрешения .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения из .env файла
dotenv.config({ path: resolve(__dirname, '../.env') });

/**
 * Конфигурация подключения к базе данных и параметры экспорта
 */
export const config = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    schema: process.env.DB_SCHEMA || 'public',
  },
  output: {
    dir: process.env.OUTPUT_DIR || '../data/generated',
  },
};

/**
 * Валидация конфигурации
 */
export function validateConfig() {
  const required = ['database', 'user', 'password'];
  const missing = required.filter(field => !config.db[field]);
  
  if (missing.length > 0) {
    throw new Error(
      `Отсутствуют обязательные параметры в .env: ${missing.join(', ')}\n` +
      'Создайте файл .env на основе .env.example'
    );
  }
}
