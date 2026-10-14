# Текущая граница выхода из фазы 2C

Исходная ревизия ledger: `87d6d7dfb1442d3eecfeb764f363ddad82a10111`.
Текущие owners обновлены после installed EPS/V Presets (`c9d8884`) и
[Smart Patch foundation](./phase-4-smart-patch-foundation-research.md).
Это конечный ledger первого generation slice, а не закрытие всего MVP.
Historical checkpoints сохраняют свои limits/counts; слово «следующий» в них
описывает состояние на момент записи. Новая комбинация двух уже проверенных
осей сама по себе не становится обязательным дополнительным gate.

| Требование                                                                            | Production owner / evidence                                                                                                                                                                                                                                                            | Оставшаяся граница                                                                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Illustrious/NoobAI prediction, noise profile, samplers, ordinary TXT/IMG/OUT          | [NoobAI recipe](./phase-2c-noobai-author-recipe-research.md), [DPM IMG](./phase-2c-noobai-vpred-dpm-image-research.md), [OUT](./phase-2c-noobai-outpaint-research.md), [Karras refusal](./phase-2c-noobai-karras-failure-research.md)                                                  | Wider formats/quality/Invoke parity и public delivery не доказаны finite low-resolution gates                         |
| Anima native sampling, conditioning/weighting, TXT/IMG/OUT                            | [Worker 0.14 regression](./phase-2c-anima-worker-014-regression-research.md), [five image methods](./phase-2c-sampler-campaign-research.md), [conditioning](./phase-2c-anima-conditioning-research.md)                                                                                 | Broader quality и packaged runtime — фаза 5; unsupported regional reference images остаются явным ограничением модели |
| LoRA stack, VAE, embeddings, configured/effective exact refs                          | [Multiple LoRA UI](./phase-2c-noobai-lora-stack-ui-research.md), [image stack](./phase-2c-noobai-lora-stack-image-research.md), [external VAE](./phase-2c-installed-external-vae-research.md), [embedding polarity](./phase-2c-noobai-embedding-image-polarity-research.md)            | Wider adapter/embedding formats — declared qualification limit; hard removal lifecycle — фаза 4                       |
| Advanced options и воспроизводимые settings                                           | [Installed CFG rescale](./phase-2c-installed-cfg-rescale-research.md), [VAE precision](./phase-2c-installed-vae-precision-research.md); Main family guards и portable schema                                                                                                           | Preset projection/UI — фаза 3, Smart Patch compare — фаза 4                                                           |
| Dynamic prompt, seeds/cap, durable jobs, Add/Save/reopen                              | [Illustrious per-prompt image](./phase-2c-illustrious-dynamic-image-per-prompt-research.md), [Anima crash/Reuse](./phase-2c-anima-image-reuse-crash-research.md), [Anima cap](./phase-2c-anima-image-batch-cap-research.md), [public outpaint](./phase-2c-public-outpaint-research.md) | Произвольное Cartesian произведение policies/batches не квалифицировано; installed flows не заменяют clean-install    |
| Project → Models exact version, return without Project mutation, local cached artwork | [Handoff](./phase-2c-resource-handoff-research.md), [previews](./phase-2c-resource-previews-research.md); `ModelManager.detailVersion` never substitutes Default                                                                                                                       | Missing exact version Close/Escape и restored control проверены named native case; Preset handoff — фаза 3            |

Конкретные code anchors: `project-generation-preparation.ts` сохраняет
clipSkip/CFG/VAE settings; `anima-generation-preparation.ts` отклоняет чужие
family settings до enqueue; `project-generation-provenance.ts` записывает
actual configuration без Regional Guidance; shared `generation-settings-comparison.ts`
сравнивает recorded versus current без изменения baseline. Сохранённый clipSkip
и refusals при импорте проверяются production preparation tests. Native fixture,
где первым отказом служит external VAE, не доказывает отдельный UI clipSkip refusal;
это уровень evidence, а не обнаруженная потеря настройки.

Открытые обязательные owners:

- Presets: [installed EPS/V Apply→inference](./phase-3-installed-presets-research.md)
  закрыт для объявленного finite recipe, включая exact noise-policy snapshots.
  Smart Patch source/target остаётся в фазе 4, other-context handoffs — в фазе 5.
  [Project Apply Models handoff](./phase-3-preset-model-handoff-research.md),
  Project Apply, Save Current,
  New Project customization и [accepted Raster result creation](./phase-3-result-preset-research.md)
  подключены к production owners с отдельными qualification checkpoints.
  [Ручной production Preset Manager](./phase-3-preset-manager-research.md)
  уже подключает create/edit/duplicate, Deleted/Restore и guards к native API;
  его собственное evidence не закрывает оставшиеся reuse flows.
- Фаза 4: empty Smart Patch document foundation закрыта отдельным checkpoint:
  independent owned draft/bbox/internal resolution/mask, Undo/Redo, native
  Save/reopen и local crash recovery. Следующие owners — painted mask storage/
  authoring и Canvas tools, затем inpaint, Smart Patch generation/variants,
  Regional Guidance, model hard removal и остальные interaction gaps.
- Фаза 5: application updater, runtime install/repair, clean-install/upgrade,
  packaging и release qualification Linux/NVIDIA.

PP-004/005/007/008 сохраняют «Пока не обещать». Finite generation evidence
позволило пройти finite Presets checkpoint и начать фазу 4, но не доказывает
полную готовность NoobAI, всех семейств или релиза.

## Named missing-version qualification

Built native harness `smoke-resource-previews.mjs` завершил 14 named checks,
8 screenshots и два подтверждённых physical exits. Offline session использует
сохранённую exact LoRA B и доступную Default A. Удалена/восстановлена только
fixture-строка `local_model_file`, actual model bytes неизменны. Warning и пустые
version details видны; Close/Escape сохраняют focus, dirty draft, настоящий
Undo/Redo, document-scoped seed cursor fixture 0 и saved `.igs` bytes. Present B
и восстановленная B — соседние controls. Реальных inference jobs тут нет.

Первый setup attempt упал на неоднозначном Naive heading locator, не на
подстановке Default; dirty fixture shutdown ожидал диалог. Его exact owned scope
завершён после проверки PID/start/group; physical exit сохранён. Corrected
`h3` locator и отказоустойчивая очистка owned tab дали свежий GREEN. Это не
semantic mutation и не штатное закрытие пользователя; raw failure сохранён.
