import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

let pool = null;

/**
 * Получение пула соединений с БД
 * @returns {Pool} Пул соединений PostgreSQL
 */
export function getPool() {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
    });

    // Обработка ошибок пула
    pool.on('error', (err) => {
      console.error('Неожиданная ошибка подключения к БД:', err);
    });
  }

  return pool;
}

/**
 * Тестирование подключения к БД
 */
export async function testConnection() {
  const client = await getPool().connect();
  try {
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    console.log('✓ Подключение к БД успешно');
    console.log(`  Время сервера: ${result.rows[0].current_time}`);
    console.log(`  Версия PostgreSQL: ${result.rows[0].version.split(',')[0]}`);
    return true;
  } catch (err) {
    console.error('✗ Ошибка подключения к БД:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Закрытие пула соединений
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Пул соединений закрыт');
  }
}
