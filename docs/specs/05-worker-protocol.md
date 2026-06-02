# Python Worker Protocol

## Роль worker'а

Python worker отвечает только за ML/inference. Он не управляет SQLite, пресетами, CivitAI, файлами приложения и бизнес-логикой.

Main process:

- запускает worker;
- держит его долгоживущим;
- отправляет jobs;
- читает progress/done/error;
- нормализует ошибки;
- сохраняет результат в SQLite;
- публикует renderer events.

## Минимальный job

```ts
type GenerationJob = {
  id: string
  workflowType: 'txt2img' | 'img2img' | 'inpaint'
  model: {
    localPath: string
    resourceId: string
    baseModelFamily?: string
    predictionType?: 'epsilon' | 'v_prediction' | 'sample'
  }
  prompt: string
  negativePrompt?: string
  loras?: Array<{
    localPath: string
    resourceId: string
    weight: number
  }>
  params: {
    width: number
    height: number
    steps: number
    cfgScale?: number
    sampler?: string
    scheduler?: string
    seed?: number
  }
  output: {
    targetPath: string
    format: 'png' | 'jpg' | 'webp'
  }
}
```

## Минимальные сообщения worker'а

```ts
type WorkerMessage =
  | { type: 'ready'; workerVersion?: string }
  | { type: 'progress'; jobId: string; progress: number; step?: number; totalSteps?: number }
  | { type: 'done'; jobId: string; outputPath: string; seed?: number }
  | { type: 'error'; jobId?: string; code: string; message: string; details?: unknown }
```

## Правила протокола

- `jobId` создаёт main process.
- Worker не выбирает имена файлов финального output.
- Worker может сообщить фактический seed, если seed был сгенерирован автоматически.
- `predictionType` — compatibility-параметр модели, а не художественная настройка. Worker должен использовать его при настройке scheduler/denoising. Для `v_prediction` нельзя молча запускать модель как `epsilon`.
- Для SDXL/Illustrious-like `.safetensors` checkpoint'ов worker следует InvokeAI-пути: грузит файл через Diffusers single-file loading, держит исходный checkpoint неизменным и кэширует уже загруженные модели/components в RAM/VRAM. Скрытая постоянная конвертация в diffusers-директорию запрещена.
- Worker-код должен быть совместим с BasedPyright и Ruff. Собственные DTO/protocol/model metadata типизируются строго; прямой Diffusers/PyTorch integration изолируется в adapter-слое.
- Ошибки worker'а не показываются в UI напрямую: main process переводит их в `AppError`.
- В MVP достаточно одного активного generation job, если это ускоряет реализацию.
