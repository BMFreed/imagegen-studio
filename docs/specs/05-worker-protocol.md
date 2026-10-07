# Python Worker Protocol

## Роль worker'а

MVP использует один Invoke-like inference pipeline для Illustrious (архитектура
SDXL) и Anima, включая совместимые LoRA. Самостоятельная поддержка базовой SDXL
не запланирована; обозначение SDXL ниже относится к внутренним компонентам
пути Illustrious. Другие inference engines не являются fallback или будущим
backend-вариантом. Diffusers и PyTorch могут оставаться внутренними библиотеками
pipeline.

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

[Prepared-batch checkpoint](../engineering/phase-2b-batch-planning-research.md)
реализует это планирование внутри main: начальный cap 32 jobs и независимый
recovery byte preflight. Новая optional `seedBehavior` metadata хранится в
frozen main context и accepted provenance; отсутствие поля у legacy результата
не восполняется догадкой. Это не новое поле Python denoising DTO. Каждый concrete
request отдельно проверяется на escaped 64 KiB transport envelope до queue
publication. [Renderer dynamic preview/settings](../engineering/phase-2b-dynamic-preview-research.md)
теперь подключены к draft и shared planner; они не создают jobs. Generate из UI
ещё не подключён.

Production ProjectService создаёт
[подготовительный контекст Illustrious `txt2img`](../engineering/phase-2b-generation-preparation-research.md):
он фиксирует точную модель, Project target, prompts, Steps/CFG и конкретный
Fixed/Random/Reuse seed. Это отдельный тип с copied PNG bytes вне JSON context, а
не сообщение worker'у или запись очереди сам по себе. Для `Reuse` он получает
document-scoped durable cursor от staging либо saved `.igs` snapshot; при
отсутствии обоих останавливается до composition и enqueue.
[Seed Reuse checkpoint](../engineering/phase-2b-seed-reuse-research.md)
проверяет этот внутренний путь, но renderer Generate ещё не подключён.
Явно выбранную поддерживаемую пару sampler/scheduler он сохраняет
вместе с Invoke scheduler key; если оба поля не заданы, контекст остаётся
неразрешённым. [Первый request boundary](../engineering/phase-2b-illustrious-request-research.md)
требует пару, CFG ≥ 1, размер кратный 8, известный prediction type и
`linux-nvidia` inference capability с подходящей версией worker. Пока запрос
ограничен 200 Steps, CFG 30 и 16 КиБ UTF-8 на каждый prompt как защитными
транспортными/операционными границами. Он создаёт только краткоживущий scratch
lease. Отдельный [durable enqueue checkpoint](../engineering/phase-2b-durable-enqueue-research.md)
копирует проверенный target в app-owned input store и создаёт SQLite `pending`
row с frozen context (до 128 КиБ); startup отменяет незавершённые rows. Отдельные
queue/staging repositories и приватный processor уже проверяют completion,
отмену и публикацию candidate на подставном inference transport.
[Development inference boundary](../engineering/phase-2b-inference-worker-research.md)
добавляет отдельный реальный Linux/NVIDIA process и TS transport для одного
Illustrious `txt2img`; [следующий внутренний checkpoint](../engineering/phase-2b-internal-handoff-and-conditioning.md)
добавляет ограниченный dual-CLIP Compel conditioning и Project → queue → staging
handoff. Локальный GPU smoke проверяет provisional sRGB PNG. Это не release
runtime и не полная capability MVP: Electron wiring, LoRA, другие входы
Invoke-like conditioning и renderer actions ещё нужны перед Generate. Маска
padding при разной длине positive/negative conditioning локально проверена для
закреплённого Diffusers 0.40, но не доказывает пиксельный паритет с Invoke.

[Qualified inference target checkpoint](../engineering/phase-2b-inference-target-composition.md)
добавляет `target-composition` к тому же inference child версии 0.2.0: его
strict parser/compositor выполняет `compose-target`, а GenerationWorkerClient
проверяет actual paths/hash/ICC/geometry/alpha тем же verifier, что и derivatives
client. Composition и generation сериализуются одним владельцем с correlated
request ID и completion type, ограничением 64 KiB и прежними deadlines/close.
Старый inference ready без target capability допускает прежний Generate request,
но отказывает composeTarget до отправки. Это prerequisite подготовки frozen
Canvas через runtime lease; Generate IPC/UI и installer от него не становятся
готовыми. Новые transport tests используют реальный child с подставным peer,
Python route tests — настоящий compositor/PNG без CUDA startup.

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

### Internal normal outpaint foundation (06.10.2026)

The [alpha conditioning contract](../engineering/phase-2c-outpaint-conditioning-research.md)
pins the ordinary Invoke Canvas policy: fractional alpha keep mask, local LaMa
infill, Gaussian weighted maximum coherence16px, minimum denoise0, output fade16px
and transparent RGBA contribution. Original document assets are preserved; seam
pixels can be overlaid by the separate contribution. Main owns copied/hash-bound
target/mask/policy/auxiliary identities; Python owns numerical conditioning and
verified local TorchScript execution. Normal inference dimensions use the /8 grid.

At this helper checkpoint these are not a new command, handshake capability or
durable job/provenance union. Public mixed-alpha Generate still refuses both families.
The [internal Illustrious adapter](../engineering/phase-2c-illustrious-outpaint-research.md)
now executes the native four-channel img2img loop with protected source/noise
restoration for both UNet and scheduler at actual selected timesteps, including
SDE intermediate evaluations and final protected VAE input. This is not a
command or advertised capability. The [internal Anima adapter](../engineering/phase-2c-anima-outpaint-research.md)
uses the existing six-method flow execution with copied original/noise/mask,
inverse-shift thresholds and shifted source mixing after completed user steps.
Heun predictors keep the native solver intermediate; terminal restoration precedes
VAE. These helpers still add no public protocol variant or accepted record.
At that checkpoint Main auxiliary install/materialization, capability
admission, Retry, RGBA publication/staging and portable accepted settings still
needed implementation and qualification before activation. The default installed
runtime contract is not changed by a development dependency or a research weight
download. Full authored masks/Regional Guidance/Smart Patch remain phase4.

### Ordinary Illustrious Euler checkpoint (07.10.2026)

[Ordinary Euler](../engineering/phase-2c-euler-research.md) adds protocol `1`
Illustrious sampling key `euler`, distinct from `euler_a`, for existing txt2img,
img2img and normal outpaint commands. Main admits it only with qualified worker
`0.13.0` and explicit `illustrious-euler`; old peers cannot acquire support by
advertising that string. Worker construction uses the actual pinned
`EulerDiscreteScheduler` and the frozen checkpoint prediction type, retaining
existing inherited schedule defaults. The new worker retains previous
Illustrious and optional native-BF16 Anima capabilities; Anima flow Euler is
unchanged. Queue and portable accepted settings allow the additive key without
rewriting historical records. There is no noise-profile DTO/migration yet:
zero-SNR, spacing policy and trained author-recipe qualification remain planned.

### Internal qualified outpaint execution checkpoint (06.10.2026)

The [execution checkpoint](../engineering/phase-2c-outpaint-execution-research.md)
adds explicit protocol `1` commands `generate-illustrious-outpaint` and
`generate-anima-outpaint`, with strict detached TS/Python capture. Qualified
worker **0.12.0** retains all preceding Illustrious capabilities and requires
`illustrious-outpaint`; original Anima additionally requires native CUDA BF16
and all six `anima-txt2img`, `anima-img2img`, `anima-lora`,
`anima-prompt-weighting`, `anima-flow-sampling` and `anima-outpaint` capabilities.
Older peers cannot gain either adapter by advertising an extra string.

Each command keeps the existing family numerical img2img plan inside its explicit
outer outpaint operation and carries captured mixed-alpha PNG/keep-mask/policy
identity plus the exact local pinned LaMa path/hash/size. Main and worker verify
actual source bytes and resources; aliases, changed alpha and unsupported policy
refuse before inference. Native masked execution publishes RGBA contribution
pixels without ordinary RGB conversion. Main independently rederives the expected
contribution alpha before staging publication, then retains its own source PNG
for restart verification after terminal queue pruning.

The generic actual-seed rule below applies unchanged to both outpaint commands:
a valid completed uint32 deviation is retained in the receipt, candidate, Reuse
cursor and accepted provenance without rewriting the frozen request. Explicit
Add and Save/readback support portable contribution records and settings
comparison. Public mixed-alpha Generate and public outpaint Retry remain closed;
first-setup LaMa installation, installed trained execution and release
qualification remain open. The research note owns evidence counts and limits;
this checkpoint does not complete phase 2C or PP-005/007/008.

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
- `predictionType` — выбранный для точного Illustrious/SDXL файла scheduler
  mode, а не художественная настройка. Если явно подтверждённого значения нет,
  Model Manager предлагает редактируемое `epsilon` как обозначенное предположение.
  Override хранится по SHA-256 и размеру; Project показывает текущий тип read-only.
  Любой сохранённый non-null или `null` в `.igs` остаётся advisory snapshot и не
  решает, какой тип попадёт в следующий job. Main при Prepare повторно хеширует
  точный файл, берёт текущий effective type и не переписывает `.igs`.
  Main повторно проверяет SHA-256 как integrity/identity, структуру checkpoint,
  обязательные компоненты и worker capability до enqueue, а затем замораживает
  фактический тип в job/provenance. Если override поменялся между Prepare и
  materialization, старый контекст отвергается и требуется новый Prepare.
  Наличие SHA-256 в app-owned manifest не служит gate. Worker использует
  frozen тип при настройке scheduler/denoising; `v_prediction` нельзя молча
  запускать как `epsilon`. Anima устанавливается с pinned Qwen3/VAE, но
  проходит отдельные rectified-flow structural и component checks и не получает
  фиктивный SDXL prediction mode.
- Для SDXL/Illustrious-like `.safetensors` checkpoint'ов worker следует InvokeAI-пути: грузит файл через Diffusers single-file loading, держит исходный checkpoint неизменным и кэширует уже загруженные модели/components в RAM/VRAM. Скрытая постоянная конвертация в diffusers-директорию запрещена.
- Для Anima worker использует отдельные model loader, Qwen3 text encoder, VAE, LoRA и denoising path. Он проверяет exact installed identities обязательных компонентов перед началом job; ImageGen Studio не выдаёт SDXL single-file загрузчик за универсальный путь для Anima.
- [Anima prompt weighting](../features/project/generate-mode/prompt-weighting.md)
  обязательно при первом Anima pipeline (фаза 2C). Typed TS compiler до enqueue
  создаёт cleaned text и weighted character spans с Unicode code-point offsets;
  frozen request сохраняет их versioned interpretation. Python валидирует
  spans, кодирует cleaned text в Qwen3 и tokenizes весь cleaned text один раз
  bundled T5 tokenizer с `offset_mapping`. Он передаёт per-token weights через
  conditioning/LLM Adapter в denoising для обоих prompt signs. Текст Project/
  preset/provenance не заменяется на stripped prompt. Current editor Compel
  suffixes и nested explicit weights покрываются compatibility tests; отсутствие
  поддержки не допускает silent uniform weights. Внутренние compiler/tokenizer/
  conditioning helpers реализованы отдельным checkpoint ниже; Anima generation
  request и frozen queue/Retry interpretation пока не подключены. Internal
  default Euler denoising имеет отдельный checkpoint ниже.
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

## Original Anima offline loader foundation

The separate [Anima loader foundation](../engineering/phase-2c-anima-qualification-research.md)
qualifies offline loading for the original Anima Base 1.0 topology using pinned
native CosmosTransformer3DModel, AnimaTextConditioner, Qwen3Model and
AutoencoderKLWan. Main returns an internal exact checkpoint/linked companion
bundle; Python independently verifies canonical no-follow snapshots, hashes,
sizes, complete keys/shapes, supported finite tensors and strict loading.
Compatible custom checkpoint hashes are not an allowlist. This adds no wire
command, ready capability or generation route. The next conditioning foundation
below implements weighting/tokenizers; its following Euler foundation implements
internal denoising. LoRA and frozen Anima job/provenance remain open. Existing
Anima refusal and worker 0.10.0 stay unchanged.

## Original Anima compiled conditioning foundation

The [conditioning foundation](../engineering/phase-2c-anima-conditioning-research.md)
adds internal TS `compileAnimaPromptWeighting` and Python
`encode_anima_conditioning_pair`. It does not add a wire command or persisted job
field. `anima-prompt-weighting-v1` supplies cleaned text and contiguous coalesced
code-point spans; Python validates and captures both interpretations before
native calls. Tokenizers use verified bundled resources, without Hub/cache
discovery. Qwen3 receives direct cleaned text; one complete T5 call yields IDs,
offsets and neutral special tokens. Weights apply once to post-adapter rows,
preserving its zero-padded tail. Truncation is observable; invalid metadata,
numeric precision loss or non-finite tensors fail explicitly.

Native CPU and actual trained-weight conditioning evidence is separate from the
following trained-image checkpoint. Family-aware editor adjustment, LoRA, other
schedulers/options, durable queue/Retry/provenance and Linux/NVIDIA release
qualification remain mandatory before admission.

## Original Anima internal Euler execution

The [Euler foundation](../engineering/phase-2c-anima-euler-research.md) consumes
internal `anima-euler-denoising-v1` plans for txt2img or opaque img2img.
TS captures fixed-shift-3 sigmas, exact strength clipping, total evaluations,
seed and independent posteriorSeed. Python validates/captures the plan and both
prompts/source pixels before native calls, preserves post-adapter weighting,
runs raw-sigma direct-flow CFG and F32 Euler accumulation with per-step dtype
restoration, and uses original Wan per-channel normalization and seeded sampling.
Native Cosmos is explicitly zero-padded/cropped for odd latent dimensions;
VAE hooks reject non-finite output before native clamp hides it. Progress reports
only completed evaluations; strength zero emits none and traverses VAE only.

The helper returns pixels without filesystem publication or queue/candidate
side effects. Actual trained NVIDIA evidence covers 256×256/three-step controls,
not full sizes, LoRA, other schedulers/options or release installation. Matching
torchvision 0.22.1 is pinned in the inference extra and checked by this helper.
No Anima command/capability, public admission, durable request/provenance field
or worker version change is added by this internal checkpoint.

## Qualified original Anima worker checkpoint (05.10.2026)

The [worker entrypoint](../engineering/phase-2c-anima-worker-entrypoint-research.md)
connects the earlier numerical/conditioning/LoRA foundations to the long-lived
inference JSONL worker `0.11.0`. It preserves the full `0.10.0` Illustrious
capability set and adds all five Anima advertisements only when the qualified
runtime supports native CUDA BF16. Unsupported BF16 withholds Anima while
preserving Illustrious; each Anima request checks compute support again.
Older/unknown peers never acquire support from capability strings alone.

`generate-anima-txt2img` and `generate-anima-img2img` use protocol `1`, request ID
and exact `job.schemaVersion=1`. The authoritative
[TS assembler](../../src/shared/projects/anima-worker-request.ts) captures
three exact original-model refs, bbox and pinned-sRGB RGBA target, both compiled
prompt-weighting values, full six-method sampling plan, ordered exact signed
LoRAs and a distinct direct staging PNG path. Python's strict parser captures
that interpretation before IO/native execution. Missing/extra advanced fields,
mode/dimension/seed-domain drift, path aliases and mixed alpha refuse explicitly.
No alternate VAE, embeddings, CLIP Skip, CFG Rescale or manual VAE precision are
silently accepted for Anima.

Native execution reaches correlated progress/done/error, exclusive provisional
sRGB PNG and optional thumbnail. Shared target verification checks both hash and
the actual captured snapshot length; shared output publication preserves existing
Illustrious behavior. This wire does not expand Main admission, durable queue
operations, Retry, accepted provenance or `.igs`. Family-aware editor and the
complete frozen Project/Main integration remain the next checkpoints. Models
remain request-owned here; cache/offload and Linux/NVIDIA runtime installation
are still separate release work. Exact wire/limits are also documented in the
[worker README](../../worker-python/README.md).

## Qualified Illustrious CFG Rescale checkpoint

The narrow implemented txt2img request has optional
`job.sampling.cfgRescale` (finite 0–0.99). New preparations freeze an effective
number, including zero; legacy omitted transport means neutral zero for Python.
Qualified inference worker 0.5.0 (and its qualified 0.6.0 successor) must advertise `illustrious-cfg-rescale` along
with txt2img, denoising progress and candidate thumbnails. Existing 0.2/0.3/0.4
workers retain their previous neutral request schema. Main strips only neutral
zero from the disposable wire copy for those peers; it rejects nonneutral input
before admission and rechecks the actual worker before dispatch. Durable inputs
are not rewritten by this adaptation.

The worker passes the frozen value as `guidance_rescale` to the pinned
Diffusers SDXL adapter for Illustrious. Queue/candidate context and worker
payload must agree on effective value. Add stores the new frozen number in
portable provenance; legacy context absence remains unrecorded. This does not
add img2img, Anima or the rest of Advanced Options. See
[executed evidence and limits](../engineering/phase-2c-cfg-rescale-research.md).

## Qualified opaque Illustrious img2img checkpoint

Worker 0.6.0 adds `illustrious-img2img` and retains the previous required
capabilities. The request `generate-illustrious-img2img` uses the same verified
checkpoint, target, prompt, output and sampling boundaries, with required finite
`job.sampling.denoisingStrength` in 0–1. The actual target PNG must be fully opaque;
txt2img requires fully transparent pixels. Partial alpha is outpaint and is not
supported by this checkpoint. Old peers cannot dispatch img2img even if they
advertise the new capability without a qualified version.

The frozen preparation kind, queue operation, request type, actual target alpha
and strength must agree at materialization, durable reads and acceptance. Retry
retains the exact source target and settings. The queue upgrade preserves old
txt2img rows, their IDs/sequences and independent completion receipts.

The pinned adapter selects Invoke's rounded training-timestep window rather than
Diffusers' floored `steps * strength`. An empty window (including strength 0)
still encodes and decodes through VAE, adds no image noise and emits no denoising
callbacks. It does not promise source-pixel identity. Nonempty windows use the
frozen seed for deterministic posterior sampling and separate initial image noise;
progress reports the actual sliced scheduler loop. Accepted provenance records
`img2img` and applied strength. No mode selector or persistent mode label is added.
See [evidence and remaining limits](../engineering/phase-2c-img2img-research.md).

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

## Qualified Illustrious LoRA checkpoint

The [LoRA slice](../engineering/phase-2c-lora-research.md) extends the same strict
normal txt2img/img2img requests with optional `job.loras`: an ordered array of
`{path, sha256, byteSize, weight}`. Only enabled resources reach the worker. New
preparations retain the full copied authoring stack separately, including disabled
refs, and cross-check its enabled subset against operational fields. Historical
absence is preserved. An empty array is removed only from a disposable wire copy
for a qualified older peer; a nonempty array requires worker **0.7.0**, capability
`illustrious-lora` and all previously qualified 0.6.0 capabilities. Unknown versions
never inherit this capability.

Main qualifies exact managed files and ordinary Kohya target/rank/header structure
before enqueue, and reverifies frozen resources before admission, Retry and
dispatch. Python independently verifies exact size/hash, bounded safetensors
header, complete tensor conversion, actual module shapes and finite tensors.
It ignores file-supplied PEFT metadata and derives native rank/alpha/target
configuration from verified tensors. Pinned PEFT **0.21.2** applies adapters to
UNet and both CLIP encoders before conditioning. Zero and signed finite weights
are preserved; no weight clamp or default substitution is performed. Nonfinite
effective scale, conditioning or inference output fails explicitly.

This checkpoint supports ordinary F16/BF16/F32 Kohya up/down pairs with optional
scalar alpha, SGM or Diffusers UNet names and pinned Linear/Conv2d targets. Missing
alpha uses rank (intrinsic scale 1). Mixed UNet naming, unsupported algorithms,
unknown target aliases and incompatible dimensions are refused, not partially
loaded. This is Illustrious support; Anima and other adapter algorithms remain
open Phase 2C work. The development runtime evidence is not release installation
qualification.

## Qualified Illustrious VAE precision checkpoint

The [VAE precision slice](../engineering/phase-2c-vae-precision-research.md) adds
optional `job.vaePrecision: Auto | FP16 | FP32` to both normal generation requests.
New frozen contexts and stored requests always record a policy, including Auto;
legacy omission remains omitted and operates through the native Auto path.
Context/wire disagreement is refused at queue/staging validation. Only the
transport's disposable request may remove Auto for a qualified older parser.

Manual precision requires qualified inference worker **0.8.0** with
`illustrious-vae-precision` and all preceding capabilities. Earlier qualified
versions cannot gain it by advertising the string. Main checks Generate, batch
admission, Retry and dispatch; transport checks again before sending any job.
No protocol operation or SQLite migration is introduced.

The pinned Diffusers VAE config controls actual encoding and decoding. Auto keeps
the native policy; FP32 enables full native upcast, FP16 disables it and retains
the half-precision VAE. UNet, CLIP and conditioning precision are not changed.
Scoped checks reject non-finite encoder/quantization/decoder outputs before
native image processing can turn NaN into a successful black PNG. Hooks are
removed after both success and failure; no silent precision retry is performed.
Immutable provenance records the selected policy; no effective dtype is invented
for Auto or legacy results. External VAE/Anima remain separate work.
