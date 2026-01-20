## Эндпоинты

### 1. Health Check

#### `GET /`

Базовая проверка работоспособности сервера.

**Параметры:** нет

**Response:**
```
"Hello World!"
```

---

## File System API

Все эндпоинты файловой системы имеют префикс `/fs`.  
Все пути (`path`) относительные от `FS_ROOT_PATH`.

---

### 2. Чтение директории

#### `GET /fs/readdir`

Возвращает список файлов и папок в указанной директории.

**Query Parameters:**

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|----------|-----|--------------|--------------|----------|
| `path` | `string` | Нет | `""` (корень) | Относительный путь к директории |

**Response:**

```json
{
  "path": "ALIS/Etran",
  "items": [
    {
      "name": "Waybill",
      "isFile": true,
      "isDirectory": false
    },
    {
      "name": "subdir",
      "isFile": false,
      "isDirectory": true
    }
  ]
}
```

---

### 3. Чтение файла

#### `GET /fs/readFile`

Возвращает содержимое файла (в кодировке UTF-8).

**Query Parameters:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `path` | `string` | Да | Относительный путь к файлу |

**Response:**

```json
{
  "path": "ALIS/Etran/Waybill",
  "content": "... содержимое файла ..."
}
```

---

### 4. Информация о файле/директории

#### `GET /fs/stat`

Возвращает метаданные файла или директории.

**Query Parameters:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `path` | `string` | Да | Относительный путь |

**Response:**

```json
{
  "path": "ALIS/Etran/Waybill",
  "size": 12345,
  "isFile": true,
  "isDirectory": false,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "modifiedAt": "2025-01-20T14:00:00.000Z",
  "accessedAt": "2025-01-20T14:05:00.000Z"
}
```

---

### 5. Создание файла

#### `POST /fs/createFile`

Создаёт новый файл. **Ошибка**, если файл уже существует (флаг `wx`).

**Request Body:**

```json
{
  "path": "ALIS/NewFile",
  "content": "Содержимое файла"
}
```

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `path` | `string` | Да | Относительный путь к новому файлу |
| `content` | `string` | Да | Содержимое файла |

**Response:**

```json
{
  "path": "ALIS/NewFile"
}
```

---

### 6. Обновление файла

#### `PUT /fs/updateFile`

Перезаписывает содержимое существующего файла.

**Request Body:**

```json
{
  "path": "ALIS/Etran/Waybill",
  "content": "Новое содержимое файла"
}
```

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `path` | `string` | Да | Относительный путь к файлу |
| `content` | `string` | Да | Новое содержимое |

**Response:**

```json
{
  "path": "ALIS/Etran/Waybill"
}
```

---

### 7. Создание директории

#### `POST /fs/mkdir`

Создаёт директорию.

**Request Body:**

```json
{
  "path": "ALIS/NewFolder/SubFolder",
  "recursive": true
}
```

| Поле | Тип | Обязательный | По умолчанию | Описание |
|------|-----|--------------|--------------|----------|
| `path` | `string` | Да | — | Относительный путь к новой директории |
| `recursive` | `boolean` | Нет | `true` | Создавать родительские директории при необходимости |

**Response:**

```json
{
  "path": "ALIS/NewFolder/SubFolder"
}
```

---

### 8. Переименование

#### `PUT /fs/rename`

Переименовывает файл или директорию. **Ошибка 409 (Conflict)**, если целевой путь уже существует.

**Request Body:**

```json
{
  "oldPath": "ALIS/OldName",
  "newPath": "ALIS/NewName"
}
```

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `oldPath` | `string` | Да | Текущий относительный путь |
| `newPath` | `string` | Да | Новый относительный путь |

**Response:**

```json
{
  "oldPath": "ALIS/OldName",
  "newPath": "ALIS/NewName"
}
```

---

### 9. Перемещение

#### `PUT /fs/move`

Перемещает файл или директорию. Внутренне использует ту же логику, что и `rename`.

**Request Body:**

```json
{
  "sourcePath": "ALIS/Etran/File",
  "destinationPath": "ALIS/Archive/File"
}
```

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `sourcePath` | `string` | Да | Текущий относительный путь |
| `destinationPath` | `string` | Да | Целевой относительный путь |

**Response:**

```json
{
  "oldPath": "ALIS/Etran/File",
  "newPath": "ALIS/Archive/File"
}
```

---

### 10. Удаление

#### `DELETE /fs/rm`

Удаляет файл или директорию.

**Query Parameters:**

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|----------|-----|--------------|--------------|----------|
| `path` | `string` | Да | — | Относительный путь к удаляемому объекту |
| `recursive` | `boolean` | Нет | `true` | Рекурсивное удаление (для директорий) |

**Response:**

```json
{
  "path": "ALIS/DeletedFile"
}
```

---

### 11. Проверка существования

#### `GET /fs/exists`

Проверяет, существует ли файл или директория по указанному пути.

**Query Parameters:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `path` | `string` | Да | Относительный путь |

**Response (файл/директория существует):**

```json
{
  "path": "ALIS/Etran",
  "exists": true,
  "isDirectory": true
}
```

**Response (не существует):**

```json
{
  "path": "ALIS/NonExistent",
  "exists": false
}
```

---

## Примеры использования (cURL)

```bash
# Чтение корневой директории
curl "http://localhost:3000/fs/readdir"

# Чтение поддиректории
curl "http://localhost:3000/fs/readdir?path=ALIS/Etran"

# Чтение файла
curl "http://localhost:3000/fs/readFile?path=ALIS/Etran/Waybill"

# Создание файла
curl -X POST "http://localhost:3000/fs/createFile" \
  -H "Content-Type: application/json" \
  -d '{"path": "test/newfile", "content": "Hello"}'

# Удаление
curl -X DELETE "http://localhost:3000/fs/rm?path=test/newfile"
```