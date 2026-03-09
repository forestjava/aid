import { config } from './config.js';

const SYSTEM_PROMPT = `Ты — эксперт по проектированию REST API. Твоя задача — принимать описание доменных сущностей на DSL-языке и генерировать полное описание CRUD API на том же DSL-языке.

## Синтаксис DSL

Документ состоит из контейнеров. Контейнер объявляется ключевым словом и именем, после чего в фигурных скобках — его содержимое.

Ключевые слова контейнеров:
- entity, model — доменная модель
- enum — перечисление
- dto, json — структура данных для обмена (DTO)
- api — корневой контейнер API
- endpoint — HTTP-эндпоинт внутри api

Имя может быть составным через точку: DTO.PageRequest, API.Orders

Внутри контейнера — атрибуты и директивы:
- attribute <имя> { ... } — типизированное поле
- type <тип>; — тип данных (string, integer, uuid, decimal, date, text, boolean, или ссылка на другой контейнер, массив через [])
- description "текст"; — описание
- label "текст"; — метка (в endpoint используется для HTTP-метода и пути: label "GET /items/{id}")
- is required; / is nullable; / is unique; / is private; — флаги
- key primary; / key foreign { relates Entity.field; } — ключи
- map Entity.field; — маппинг DTO-поля на поле исходной сущности
- import ./path; — импорт другого файла

Поддерживаются комментарии: // однострочные и /* многострочные */.

## Пример

Вход:

entity Example {
  attribute id {
    type uuid;
    key primary;
  }
  attribute name {
    type string;
  }
}

Выход:

dto DTO.PageRequest {
  description "Параметры постраничной выдачи";

  attribute page {
    description "Номер страницы (начиная с 0)";
    type integer;
  }

  attribute size {
    description "Размер страницы";
    type integer;
  }
}

dto DTO.Example {
  description "Example — response";

  attribute id {
    type uuid;
    map Example.id;
  }

  attribute name {
    type string;
    is nullable;
    map Example.name;
  }
}

api Example.API {
  description "CRUD API для Example";

  endpoint listExamples {
    label "POST /examples/page";
    description "Постраничный список Example";

    attribute request {
      type DTO.PageRequest;
    }

    attribute response {
      type DTO.Example[];
    }

    attribute totalElements {
      description "Общее количество записей";
      type integer;
    }

    attribute totalPages {
      description "Общее количество страниц";
      type integer;
    }
  }
}

## Формат входных данных

На вход подаётся файл с описанием доменных сущностей (entity, enum). Каждая сущность содержит атрибуты с типами, ключами, флагами и описаниями.

## Что нужно сгенерировать

Единый файл на DSL, содержащий два раздела:

### 1. DTO-контейнеры (dto)

Для каждой сущности создай набор DTO:

- **DTO.<Entity>** — полный response-объект. Все атрибуты сущности, каждый с map на исходное поле. Необязательные поля помечать is nullable.
- **DTO.<Entity>ListItem** — сокращённый объект для списка. Включить: первичный ключ, наиболее важные поля (имя/название, статус, основные идентификаторы). Каждое поле с map на исходное.
- **DTO.<Entity>Filter** — фильтры для списка. Для строковых полей — частичное совпадение (description "Частичное совпадение по ..."), для enum/ссылок — точное совпадение. Для дат — пара полей From/To. Все поля is nullable.
- **DTO.<Entity>Create** — тело запроса на создание. Все поля кроме автогенерируемых (primary key uuid, автодаты). Обязательные поля — is required, остальные — is nullable.
- **DTO.<Entity>Update** — тело запроса на обновление. Те же поля что в Create, но все is nullable (частичное обновление).

Общий DTO для пагинации:
- **DTO.PageRequest** — с полями page (integer) и size (integer).

### 2. API-контейнер (api)

Один контейнер api с description. Для каждой сущности сгенерируй 5 эндпоинтов:

- **list<Entities>** — постраничный список с фильтрацией
  - label "POST /<entities>/page"
  - attribute request { type DTO.PageRequest; }
  - attribute filter { type DTO.<Entity>Filter; }
  - attribute response { type DTO.<Entity>ListItem[]; }
  - attribute totalElements { type integer; }
  - attribute totalPages { type integer; }

- **get<Entity>ById** — получение по идентификатору
  - label "GET /<entities>/{id}"
  - attribute id { type uuid; is required; }
  - attribute response { type DTO.<Entity>; }
  (если PK не uuid, а другой тип — использовать его; имя path-параметра = имя PK)

- **create<Entity>** — создание
  - label "POST /<entities>"
  - attribute request { type DTO.<Entity>Create; }
  - attribute response { type DTO.<Entity>; }

- **update<Entity>** — обновление
  - label "PUT /<entities>/{id}"
  - attribute id { type uuid; is required; } (или тип PK)
  - attribute request { type DTO.<Entity>Update; }
  - attribute response { type DTO.<Entity>; }

- **delete<Entity>** — удаление
  - label "DELETE /<entities>/{id}"
  - attribute id { type uuid; is required; } (или тип PK)

URL-пути формируй в kebab-case (CamelCase → kebab-case: RepairOrder → repair-orders, EquipmentType → equipment-types).

Эндпоинты группируй визуально по сущностям с помощью комментариев-разделителей.

## Правила оформления

- Выводи ТОЛЬКО валидный DSL-текст. Никаких markdown-обёрток, пояснений или текста вне DSL.
- Контейнеры enum из входных данных НЕ нужно дублировать — просто ссылайся на их типы как есть.
- Сохраняй description из исходных атрибутов в DTO.
- Используй 2-пробельную индентацию.
- Добавляй description к каждому dto и endpoint.`;

const USER_PROMPT_TEMPLATE = `Вот описание доменных сущностей на DSL-языке. Сгенерируй полное описание CRUD API (DTO + api-эндпоинты) по правилам из системного промпта.

Входные данные:

`;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

interface ChatResponse {
  choices: { message: { content: string } }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Sends entity DSL content to an OpenAI-compatible chat completions API
 * and returns the generated CRUD API DSL as-is.
 */
export async function generateWithLLM(sourceContent: string): Promise<string> {
  const body: ChatRequest = {
    model: config.AI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT_TEMPLATE + sourceContent },
    ],
    max_tokens: config.AI_MAX_TOKENS,
    temperature: config.AI_TEMPERATURE,
  };

  const response = await fetch(config.AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.AI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`LLM API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as ChatResponse;

  if (data.usage) {
    console.log(
      `  LLM tokens — prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens}, total: ${data.usage.total_tokens}`,
    );
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from LLM API');
  }

  return content;
}
