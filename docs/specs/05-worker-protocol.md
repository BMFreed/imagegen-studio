# Python Worker Protocol

## Роль worker'а

Python worker отвечает только за ML/inference. Он не управляет SQLite, пресетами, CivitAI, файлами приложения и бизнес-логикой.

Main process:

- запускает worker;
- держит его долгоживущим;
- держит persistent queue generation jobs; future Upscale jobs may reuse it;
- отправляет в worker только один active job за раз в MVP;
- читает progress/done/error;
- нормализует ошибки;
- сохраняет worker output как temporary staging candidate;
- публикует renderer events.

## Queue-first contract

MVP проектируется вокруг очереди jobs, а не вокруг ad-hoc single generation call.

Main process владеет:

- SQLite-backed queue;
- job lifecycle;
- frozen job payloads;
- staging destination and temporary-output lifecycle;
- cancel/retry/delete/prune actions;
- renderer events.

Python worker выполняет только текущий job и не знает о полной очереди.

## Минимальный worker job

```ts
type WorkerJob = {
  id: string;
  queueItemId: string;
  operation: 'generate' | 'smart-patch-generate' | 'upscale'; // upscale is reserved for a follow-up
  workflowType: 'txt2img' | 'img2img' | 'inpaint' | 'outpaint' | 'upscale';
  model: {
    localPath: string;
    resourceId: string;
    baseModelFamily?: string;
    predictionType?: 'epsilon' | 'v_prediction' | 'sample';
  };
  prompt: string;
  negativePrompt?: string;
  loras?: Array<{
    localPath: string;
    resourceId: string;
    weight: number;
  }>;
  params: {
    width: number;
    height: number;
    steps: number;
    cfgScale?: number;
    sampler?: string;
    scheduler?: string;
    seed?: number;
  };
  output: {
    targetPath: string;
    format: 'png' | 'jpg' | 'webp';
  };
  metadata: {
    projectId: string;
    stagingSessionId: string;
    targetLayerId?: string;
  };
};
```

## Минимальные сообщения worker'а

```ts
type WorkerMessage =
  | {
      type: 'ready';
      capabilities: string[];
      protocolVersion: string;
      pythonVersion: string;
      runtimeProfile: string;
      workerVersion: string;
    }
  | { type: 'progress'; jobId: string; progress: number; step?: number; totalSteps?: number }
  | { type: 'done'; jobId: string; outputPath: string; seed?: number }
  | { type: 'canceled'; jobId: string }
  | { type: 'error'; jobId?: string; code: string; message: string; details?: unknown };
```

## Правила протокола

- `jobId` создаёт main process.
- Main process принимает worker jobs только после валидного `ready` handshake. Несовместимые `workerVersion` / `protocolVersion` или неожиданный `runtimeProfile` являются runtime activation/startup error, а не generation job error.
- `pythonVersion`, runtime profile и capabilities используются для diagnostics и compatibility checks, но не показываются как постоянные пользовательские labels в основном UI.
- `queueItemId` связывает worker job с SQLite queue item.
- Queue item contains a frozen job payload derived from Project/Smart Patch state. Worker does not read mutable renderer state.
- В MVP main process отправляет worker'у только один active job одновременно, но pending jobs уже хранятся в queue.
- Worker не выбирает имена файлов финального output.
- Worker может сообщить фактический seed, если seed был сгенерирован автоматически.
- Worker должен поддерживать cancel request на безопасных границах, особенно во время denoising steps.
- `predictionType` — compatibility-параметр модели, а не художественная настройка. Worker должен использовать его при настройке scheduler/denoising. Для `v_prediction` нельзя молча запускать модель как `epsilon`.
- Для SDXL/Illustrious-like `.safetensors` checkpoint'ов worker следует InvokeAI-пути: грузит файл через Diffusers single-file loading, держит исходный checkpoint неизменным и кэширует уже загруженные модели/components в RAM/VRAM. Скрытая постоянная конвертация в diffusers-директорию запрещена.
- Worker-код должен быть совместим с BasedPyright и Ruff. Собственные DTO/protocol/model metadata типизируются строго; прямой Diffusers/PyTorch integration изолируется в adapter-слое.
- Ошибки worker'а не показываются в UI напрямую: main process переводит их в `AppError`.
- Completed outputs are stored as temporary candidates and published to the target staging session. Worker completion does not mutate `.igs`, create generation provenance, write accepted-result history or create an undo step.
- A separate Project command accepts one or more completed candidates and commits them as Raster Layers or Smart Patch variants.

Перед активацией нового environment runtime manager также запускает worker self-test без пользовательской модели. Он должен проверить imports/native extensions, выбранный device/backend, минимальную tensor operation и тот же versioned handshake. Lifecycle установки, app-managed CPython и rollback описаны в [Python Runtime And Dependency Management](./07-python-runtime-management.md).

## Queue item lifecycle

```ts
type QueueItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
```

Startup rule:

- `running` jobs from previous app lifetime become `canceled`;
- `pending` jobs remain pending unless user/app clears them;
- terminal queue history may be pruned by retention policy.
