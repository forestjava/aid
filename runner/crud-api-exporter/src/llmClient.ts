import { config } from './config.js';
import { toolDefinitions, executeTool } from './tools/index.js';
import type { ToolContext } from './tools/index.js';

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

- import ./path; — импорт другого файла

Атрибуты и директивы внутри контейнера
  label "текст";            — метка
  attribute <имя> { ... }   — типизированное поле
    type <тип>;               — тип данных
    description "текст";      — описание
    is required;              — обязательное поле
    is nullable;              — может быть null
    is private;               — скрытое поле
    key primary;              — первичный 
    map Entity.field; — маппинг поля на поле исходной сущности
    sync Entity.field; — синхронизация значения поля с полем исходной сущности

### Типы данных

Примитивы (string, integer, uuid, decimal, date, text, boolean). 
Массив: тип с суффиксом [].  
**Ссылочные типы** — для связи с другой сущностью используй её имя напрямую в качестве типа:
attribute productType {
  type ProductType;
}

### Связи между сущностями

**1:1** — атрибут со ссылочным типом:
attribute status {
  type StockStatus;
}

**1:many** — массив дочерней сущности объявляется в родительской:
entity Order {
  attribute lines {
    type OrderLine[];
  }
}

**Самоссылка (иерархия):**
attribute parent {
  type Product;
  is nullable;
}

### Флаги is required / is nullable
- Поля с key primary считаются обязательными по определению.
- Примитивные типы (string, integer, decimal, boolean, date, text, uuid) считаются заполняемыми по умолчанию.
- is required указывается только для **ссылочных типов**, когда связь обязательна.
- is nullable указывается для ссылочных типов, когда связь необязательна.

### Прочие правила

- Уникальность выражается структурой модели.
- Поддерживаются комментарии: // однострочные и /* */ многострочные.
- import ./path; — импорт другого файла.

### Минимальный пример
entity Category {
  attribute id {
    type uuid;
    key primary;
  }
  attribute name {
    type string;
    description "Название категории";
  }
}

entity Product {
  attribute id {
    type uuid;
    key primary;
  }
  attribute name {
    type string;
  }
  attribute category {
    type Category;
    is required;
  }
  attribute parent {
    type Product;
    is nullable;
  }
}

enum Status {
  value ACTIVE;
  value ARCHIVED;
}


## Формат входных данных

На вход подаётся файл с описанием доменных сущностей (entity, enum). Каждая сущность содержит атрибуты с типами, ключами, флагами и описаниями.

## Что нужно сгенерировать

С помощью доступного тебе инструмента "writeFile" сформируй два файла на DSL:
- Первый вызов: writeFile с filename="dto" — DTO-контейнеры
- Второй вызов: writeFile с filename="api" — API-контейнеры

### 1. DTO-контейнеры (dto)

Для каждой сущности, кроме enum или отмеченных как 'is dependent', создай полный набор DTO:

- **DTO.<Entity>** — полный response-объект. Все атрибуты сущности, каждый с map на исходное поле. Необязательные поля помечать is nullable.
- **DTO.<Entity>Create** — тело запроса на создание. Все поля кроме автогенерируемых (primary key uuid, автодаты). Обязательные поля — is required, остальные — is nullable. map на исходное поле.
- **DTO.<Entity>Update** — тело запроса на обновление. Те же поля что в Create, но все is nullable (частичное обновление). map на исходное поле.
(Для сущностей, отмеченных как 'is dependent' достаточно только **DTO.<Entity>**.)
(Контейнеры enum из входных данных не нужно дублировать — просто ссылайся на их типы как есть.)

Общие DTO для пагинации и фильтрации:
- **DTO.<Entity>ListRequest** — объединяет фильтры и пагинацию в одном теле POST-запроса для запроса отфильтрованного списка с определенной страницы пагинации
- **DTO.<Entity>ListResponse** — оборачивает результирующий массив сущностей content вместе с метаданными фильтрации и пагинации.
При необходимости используй ссылки на DTO.Filter, DTO.PageRequest, DTO.PageInfo и т.п. так, как будто они уже существуют, не описывая их самих для лаконичности выходного текста.

### 2. API-контейнеры (api)

Для каждой сущности, кроме enum или кроме отмеченных как 'is dependent', сгенерируй по 5 эндпоинтов: получение списка, получение элемента по ключу, добавление, изменение и удаление.
(Сущности, отмеченные как 'is dependent', включены в состав родительской и управляются каскадно, одновременно с родительской). 

Определяй тип response для операций чтения (read) как DTO.
Не определяй response для операций модификации (create/update/delete) в целях лаконичности выходного текста.

api API.Product {
  description "API управления Справочником товаров";

  ...

  endpoint listProducts {
    label "POST /products/page";
    description "Постраничный список товаров с фильтрацией";
    attribute request {
      type DTO.ProductListRequest;
    }
    attribute response {
      type DTO.ProductListResponse;
    }
  }

  endpoint updateProduct {
    label "PUT /products/{id}";
    description "Обновить товар";
    attribute id {
      type uuid;
    }
    attribute request {
      type DTO.ProductUpdate;
    }
  }
  
  ...
  
}

## Правила оформления

- В content каждого вызова writeFile передавай ТОЛЬКО валидный DSL-текст. Никаких markdown-обёрток, пояснений или текста вне DSL.
- Сохраняй description из исходных атрибутов в DTO.
- Используй 2-пробельную индентацию.
- Добавляй description к каждому dto и endpoint.
`;

const USER_PROMPT_TEMPLATE = `Вот описание доменных сущностей на DSL-языке. Сгенерируй полное описание CRUD API (DTO + api-эндпоинты) по правилам из системного промпта, используя инструмент writeFile.

Входные данные:

`;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: { type: 'function'; function: Record<string, unknown> }[];
  tool_choice?: string | Record<string, unknown>;
  max_tokens?: number;
  temperature?: number;
}

interface ChatResponse {
  choices: {
    message: {
      content?: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function generateWithLLM(
  sourceContent: string,
  context: ToolContext,
): Promise<void> {
  const body: ChatRequest = {
    model: config.AI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT_TEMPLATE + sourceContent },
    ],
    tools: toolDefinitions.map((td) => ({
      type: td.type,
      function: td.function as Record<string, unknown>,
    })),
    tool_choice: 'required',
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
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;
    const usageMsg = `LLM tokens — prompt: ${prompt_tokens}, completion: ${completion_tokens}, total: ${total_tokens}`;
    console.log(`  ${usageMsg}`);
    await context.sendProgress('processing', usageMsg);
  }

  const toolCalls = data.choices?.[0]?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    throw new Error('LLM did not return any tool calls');
  }

  for (const tc of toolCalls) {
    const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    const argsPreview = args.filename
      ? `filename="${args.filename}", content: ${String(args.content ?? '').length} символов`
      : tc.function.arguments.slice(0, 200);

    await context.sendProgress(
      'processing',
      `Вызов ${tc.function.name}(${argsPreview})`,
    );

    const result = await executeTool(tc.function.name, args, context);

    await context.sendProgress(
      'processing',
      `Результат ${tc.function.name}: ${result}`,
    );
  }
}
