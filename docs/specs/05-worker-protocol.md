# Python Worker Protocol

## Роль worker'а

MVP использует один Invoke-like inference pipeline для Illustrious/SDXL и Anima, включая совместимые LoRA. Другие inference engines не являются fallback или будущим backend-вариантом. Diffusers и PyTorch могут оставаться внутренними библиотеками pipeline.

TypeScript владеет строго типизированной бизнес-логикой, очередью, проверкой совместимости ресурсов/операций и подготовкой immutable job inputs. Python worker загружает и кэширует модели в RAM/VRAM, выполняет model-specific conditioning и denoising, создаёт image derivatives/thumbnails из переданных assets и промежуточные previews во время генерации. Он не управляет SQLite, пресетами, CivitAI, app-managed storage, именами/путями файлов или публикацией результатов. Main process владеет download, file cache, materialization, storage и атомарной публикацией output; worker получает только разрешённые main-managed paths.

Main process:

- запускает worker;
- держит его долгоживущим;
- держит persistent queue generation jobs; future Upscale jobs may reuse it;
- отправляет в worker только один active job за раз в MVP;
- читает progress/done/error;
- нормализует ошибки;
- валидирует и сохраняет worker output как app-managed staging recovery
  candidate с manifest и frozen generation context;
- публикует renderer events.

Первый release target — Linux с NVIDIA GPU. Другая ОС или device profile не должны переключать приложение на альтернативный inference engine; это отдельная работа по портированию того же pipeline.

## Queue-first contract

MVP проектируется вокруг очереди jobs, а не вокруг ad-hoc single generation call.

Main process владеет:

- SQLite-backed queue;
- job lifecycle;
- frozen job payloads;
- staging destination, durable candidate recovery and cleanup lifecycle;
- cancel/retry/delete/prune actions;
- renderer events.

Python worker выполняет только текущий job и не знает о полной очереди.

## Иллюстративная транспортная оболочка

Следующий shape показывает identity, routing и output handoff, но **не является
полной исполнимой схемой генерации**. В частности, плоских `params` недостаточно
для img2img/inpaint/outpaint: они не описывают frozen composite, mask,
положение bbox, VAE, Regional Guidance и model-specific ветви. Его нельзя
реализовывать как единственный worker DTO.

```ts
type WorkerJobEnvelopeSketch = {
  id: string
  queueItemId: string
  operation: 'generate' | 'smart-patch-generate' | 'upscale' // upscale is reserved for a follow-up
  workflowType: 'txt2img' | 'img2img' | 'inpaint' | 'outpaint' | 'upscale'
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
    seed: number // concrete scheduled seed, not the Seed policy
  }
  output: {
    targetPath: string
    format: 'png' | 'jpg' | 'webp'
  }
  metadata: {
    projectId: string
    stagingSessionId: string
    targetLayerId?: string
  }
}
```

Production request должен использовать типизированный discriminated union для
txt2img, img2img, inpaint, outpaint и Smart Patch target. Main process freeze'ит
в его составе bbox `{x,y,width,height}` в координатах бесконечного Project,
исходный composite/alpha, mask и другие входные assets по immutable identity и
hash, exact model/LoRA/VAE refs, применимые advanced options и operational
Regional Guidance inputs. В worker передаются уже materialized paths этих
assets, а не ссылки на изменяемый renderer state. Неподдерживаемые сочетания
model/operation/options отвергаются до enqueue с объяснимой ошибкой, а не
игнорируются worker'ом. Invoke-like adapter компилирует этот domain request в
семейный pipeline/graph; graph не становится скрытым пользовательским проектом
или пресетом. Такой порядок следует
[SDXL graph builder](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/nodes/util/graph/generation/buildSDXLGraph.ts#L41)
и [Anima graph builder](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/nodes/util/graph/generation/buildAnimaGraph.ts#L32)
в InvokeAI checkout `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`, без
предположения, что их graph DTO можно перенести один к одному. Отдельная
[reference note](../engineering/invoke-recovery-canvas-reference.md) подтверждает
queue, staging и canvas lifecycle, но не является спецификацией inference.

Capability validation до enqueue различает Illustrious/SDXL и Anima, а не
полагается на универсальные поля `model`, `loras` и `params` из эскиза выше.
Для обоих семейств нужны compatible LoRA и positive regional text. Regional
negative text для Illustrious входит в pipeline; для Anima его spatial semantics
имеет отдельный validation gate ниже. Regional reference images допустимы
только с Illustrious/SDXL; inverse-mask
`auto-negative` недоступен для обоих. Anima требует installed Qwen3 encoder и
совместимый VAE вместе с checkpoint'ом; отсутствие любого компонента блокирует
job с объяснимой ошибкой. Model Manager показывает полный объём скачивания
Anima-набора до загрузки. Для Anima regional negative text требуется
integration check на реальных изображениях, подтверждающий spatial behavior:
пока он не пройден, запрос с таким input не может быть молча исполнен как
глобальный negative prompt. Unsupported combinations отвергаются до enqueue.

Для raster-only Project target в фазе 2A есть отдельный versioned
`compose-target` DTO ниже. Это подготовка пикселей перед заданием, а не полный
generation request. Граница TS/Python для masks, Smart Patch, intermediate
image transforms, graph steps и live previews, а также семейная capability
matrix всё ещё требуют исполнимого DTO фазы 2B. Их нельзя вывести из
транспортного эскиза или считать реализованными по одному наличию Invoke
graph builders.

Regional Guidance может быть нужен именно в frozen operational request, чтобы
job выполнился корректно. По отдельному продуктовому решению он не копируется
в accepted-result provenance и не появляется в result-derived preset.

Before enqueue, main process resolves `Fixed`, `Random` or `Reuse` to concrete
uint32 seeds for every job. `Reuse` snapshots only this Project's durable last
actual seed at Generate time; without one, Generate is blocked. `Per iteration`
or `Per prompt` then schedules the batch from that base. The frozen request
keeps the concrete seed and requested policy separately, so later completions
cannot silently change an already queued batch.

В текущем production main есть только
[подготовительный контекст Illustrious `txt2img`](../engineering/phase-2b-generation-preparation-research.md):
он фиксирует точную модель, Project target, prompts, Steps/CFG и конкретный
Fixed/Random seed. Это отдельный тип с copied PNG bytes вне JSON context, а
не сообщение worker'у или запись очереди. Он отвергает `Reuse` до подключения
durable cursor. Явно выбранную поддерживаемую пару sampler/scheduler он сохраняет
вместе с Invoke scheduler key; если оба поля не заданы, контекст остаётся
неразрешённым. [Первый request boundary](../engineering/phase-2b-illustrious-request-research.md)
требует пару, CFG ≥ 1, размер кратный 8, известный prediction type и
`linux-nvidia` inference capability с подходящей версией worker. Пока запрос
ограничен 200 Steps, CFG 30 и 16 КиБ UTF-8 на каждый prompt как защитными
транспортными/операционными границами. Он создаёт только краткоживущий scratch
lease. Отдельный [durable enqueue checkpoint](../engineering/phase-2b-durable-enqueue-research.md)
копирует проверенный target в app-owned input store и создаёт SQLite `pending`
row с frozen context (до 128 КиБ); startup отменяет незавершённые rows. Queue
dispatch/actions, реальный inference worker и candidate publication всё ещё
нужны перед Generate.

## Минимальные сообщения worker'а

### Исполнимая граница превью Project в фазе 2A

Для явного Save main передаёт worker'у `compose-preview` с массивом видимых
Raster Layers **сверху вниз**. Каждый элемент содержит main-owned canonical
path к замороженному sRGB PNG/WebP, SHA-256, width/height, opacity, blend mode
(`normal`, `multiply`, `screen`, `overlay`) и transform
`{x,y,scaleX,scaleY,rotationDegrees}`. Output содержит уникальный app-managed
`stagingRoot`, заранее назначенные пути `mergedPngPath`/`thumbnailWebpPath` и
`thumbnailMaxSide`. `preview-done` возвращает либо `rendered` с integer
world-space `rect` и метаданными двух файлов, либо `empty` с `null`-полями и
без созданных файлов. Детальный JSON-lines shape и provisional ceilings
зафиксированы в [worker README](../../worker-python/README.md).

Main повторно проверяет source hash и sRGB-совместимость до отправки; валидные
untagged RGB assets из `.igs` v1 трактуются как sRGB, а embedded ICC должен
совпадать с закреплённым sRGB profile. Затем main
проверяет returned rect внутри геометрии слоёв, содержимое, формат, размеры,
pinned ICC и hashes обоих output. Он привязывает результат к ревизии Project и лишь
после этого включает файлы в `.igs` через атомарный Save. Ошибка worker,
превышение лимита или изменившаяся ревизия ведут к `unavailable` placeholder,
не к старому превью. Полностью прозрачные слои могут дать `empty` только после
проверки пикселей worker'ом. Этот путь пока проверен с source-checkout
`derivatives-only` worker; installable Linux/NVIDIA runtime остаётся отдельной
задачей. Эта команда не является `compose-target`: preview можно обрезать и
уменьшить, тогда как генерации нужен точный конечный bbox со всей прозрачностью.

### Конечный raster-only target для будущей генерации в фазе 2A

Main фиксирует ревизию документа, primary bbox и видимые Raster Layers. Для
каждого слоя он копирует сохранённые или ещё не сохранённые asset bytes в своё
временное хранилище с проверкой SHA-256. `compose-target` получает этот
top-first список в том же формате, что `compose-preview`, явный целочисленный
`bbox: {x,y,width,height}` и `output: {stagingRoot,targetPngPath}`. Worker
проверяет входы и создаёт внутри bbox **точный** 8-bit RGBA PNG с закреплённым
sRGB ICC: без crop по alpha и без downsample. Пустой список слоёв и видимые
слои вне bbox дают прозрачный PNG тех же размеров.

`target-done` возвращает заданный bbox как `rect`, `composite` metadata
`{byteSize,width,height,sha256,colorSpace:"srgb"}` и `mode`. Финальная alpha
составленного изображения определяет `txt2img` при полностью прозрачном bbox,
`img2img` при полностью непрозрачном и `outpaint` во всех промежуточных случаях,
в том числе при частичной прозрачности от opacity или ресемплинга. Main
проверяет реальные bytes, PNG/ICC/размеры/hash и выводит mode из alpha повторно;
worker claim не принимается без проверки. Main возвращает проверенные PNG bytes
и удаляет временный scratch: операция не меняет `.igs`, document shadow,
staging recovery или очередь.

Предварительный технический потолок — 2,048 px на сторону, 4 млн target pixels,
256 слоёв и 128 млн aggregate source pixels. Превышение target ceiling даёт
`IMAGE_TOO_LARGE`, в том числе при пустом проекте; точный target нельзя
незаметно уменьшить как превью. Это защитные лимиты, **не измеренная ёмкость**
моделей или публичное обещание размера генерации. В фазе 2B target станет лишь
одной частью frozen job payload вместе с exact ресурсами, настройками, seed,
mask/region inputs и операцией модели. `compose-target` сам не запускает
inference и не публикует candidate.

```ts
type WorkerMessage =
  | {
      type: 'ready'
      capabilities: string[]
      protocolVersion: string
      pythonVersion: string
      runtimeProfile: string
      workerVersion: string
    }
  | { type: 'progress'; jobId: string; progress: number; step?: number; totalSteps?: number }
  | { type: 'done'; jobId: string; outputPath: string; seed: number }
  | { type: 'canceled'; jobId: string }
  | { type: 'error'; jobId?: string; code: string; message: string; details?: unknown }
```

## Правила протокола

- `jobId` создаёт main process.
- Main process принимает worker jobs только после валидного `ready` handshake. Несовместимые `workerVersion` / `protocolVersion` или неожиданный `runtimeProfile` являются runtime activation/startup error, а не generation job error.
- `pythonVersion`, runtime profile и capabilities используются для diagnostics и compatibility checks, но не показываются как постоянные пользовательские labels в основном UI.
- `queueItemId` связывает worker job с SQLite queue item.
- Queue item contains a frozen job payload derived from Project/Smart Patch state. Worker does not read mutable renderer state.
- В MVP main process отправляет worker'у только один active job одновременно, но pending jobs уже хранятся в queue.
- Worker не выбирает имена файлов финального output.
- `output.targetPath` указывает на main-managed provisional output. Worker
  `done` означает завершение inference, но не публикацию готового candidate:
  main process проверяет файл, атомарно публикует asset и staging recovery
  manifest с frozen job inputs/resources и фактическими result metadata, затем
  переводит queue item в `completed` и сообщает renderer. При неудаче записи
  кандидат не показывается; job получает нормализованную ошибку, partial file
  отправляется на cleanup.
- Worker всегда сообщает фактически использованный uint32 seed в `done`.
  Main process проверяет его вместе с output; отсутствие или недопустимое
  значение делает completion ошибкой. Если worker использовал seed, отличный
  от запланированного, фактическое значение сохраняется в candidate context и
  показывается как отклонение для диагностики; именно оно становится следующим
  `Reuse` cursor и записывается в provenance при acceptance.
- Worker должен поддерживать cancel request на безопасных границах, особенно во время denoising steps.
- `predictionType` — compatibility-параметр Illustrious/SDXL, а не художественная настройка. Main допускает этот pipeline к Generate только с exact checkpoint SHA-256 в проверенном app-owned manifest. CivitAI metadata или удачная загрузка файла worker'ом не дают оснований подставить `epsilon`; unknown блокирует job до enqueue. Worker использует подтверждённый тип при настройке scheduler/denoising. Для `v_prediction` нельзя молча запускать модель как `epsilon`. Anima проверяется отдельной exact-hash записью rectified-flow capability и не получает фиктивный SDXL prediction mode.
- Для SDXL/Illustrious-like `.safetensors` checkpoint'ов worker следует InvokeAI-пути: грузит файл через Diffusers single-file loading, держит исходный checkpoint неизменным и кэширует уже загруженные модели/components в RAM/VRAM. Скрытая постоянная конвертация в diffusers-директорию запрещена.
- Для Anima worker использует отдельные model loader, Qwen3 text encoder, VAE, LoRA и denoising path. Он проверяет exact installed identities обязательных компонентов перед началом job; ImageGen Studio не выдаёт SDXL single-file загрузчик за универсальный путь для Anima.
- Worker создаёт запрошенные thumbnails/image derivatives из main-managed immutable sources и может отдавать промежуточный denoising preview. Main process задаёт назначение, проверяет размеры/формат, кэширует и публикует файлы; прогресс/preview не является готовым candidate и не попадает в `.igs` автоматически.
- Для raster import worker применяет EXIF Orientation, затем преобразует pixels
  из встроенного ICC в рабочее sRGB. Он возвращает исходные ICC bytes отдельно
  для metadata слоя и сообщает ошибку при повреждённом профиле. Untagged RGB
  трактуется как sRGB; PNG с явными не-sRGB `gAMA`/`cHRM`/`cICP` без ICC
  отклоняется с диагностикой, а untagged CMYK не принимается. Main проверяет формат,
  размеры, hash и закреплённый sRGB ICC нормализованного output до публикации.
  Те же sRGB pixels используются compositor и image export первого релиза;
  color conversion не выполняется скрыто в `.igs` writer.
- При недоступном ML Worker main может включить в явный Save статические
  bundled preview placeholders и `preview.status=unavailable` в `.igs` manifest. Это
  fallback для сохранения документа, а не альтернативный image processor:
  отдельный preview worker не запускается, реальный derivative main не строит.
  Для проекта без видимых raster pixels состояние остаётся `empty`. Рабочий
  worker пересоздаёт previews для следующего явного Save или explicit
  `Rebuild Preview` чистого Project; фоновая задача не переписывает `.igs`.
- Worker-код должен быть совместим с BasedPyright и Ruff. Собственные DTO/protocol/model metadata типизируются строго; прямой Diffusers/PyTorch integration изолируется в adapter-слое.
- Ошибки worker'а не показываются в UI напрямую: main process переводит их в `AppError`.
- Completed outputs are stored as locally recoverable, unaccepted candidates
  and published to the target staging session only after durable validation.
  Worker completion does not mutate the main `.igs`, create accepted-result
  provenance/history or create an undo step. The candidate manifest retains
  frozen context even after its queue row is pruned.
- Only after validated output and durable candidate manifest publication may
  main process advance the Project's local last-actual-seed cursor. It commits
  queue completion and cursor together, then reconciles a published manifest
  idempotently after a crash if that transaction did not finish. Pending,
  canceled, failed and partial jobs never advance the cursor. Discarding a
  completed candidate or pruning its queue row does not rewind it.
- A separate Project command accepts one or more completed candidates into
  Raster Layers or Smart Patch variants in the open document/recovery shadow;
  explicit Save later updates the main `.igs`.
- After confirmed graceful Project close, main process cancels its unfinished
  jobs and discards its staging. A late `done` for that canceled session cannot
  publish a candidate or mutate the closed Project.

Перед активацией нового environment runtime manager также запускает worker self-test без пользовательской модели. Он должен проверить imports/native extensions, выбранный device/runtime profile, минимальную tensor operation и тот же versioned handshake. Lifecycle установки, app-managed CPython и rollback описаны в [Python Runtime And Dependency Management](./07-python-runtime-management.md).

## Queue item lifecycle

```ts
type QueueItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled'
```

Startup rule:

- `pending` and `running` jobs from the previous app lifetime become
  `canceled`; none resume automatically;
- valid completed candidate manifests/assets remain recoverable locally even
  if their queue rows are pruned or were not updated before the crash;
- invalid/partial outputs are excluded and diagnosed; terminal queue history
  may be pruned independently of valid candidate recovery.
