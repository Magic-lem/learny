import type { Source, StudyCourse, StudyNode } from './study-types.ts'
export const courseVersion = 'dsh-tool-call@639ed015:v1'
export const sources: Source[] = [
  {
    "id": "schemas",
    "title": "工具注册与模型 schema",
    "path": "packages/core/tools/src/index.ts",
    "url": "https://github.com/deepseek-ai/DeepSeek-Harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/tools/src/index.ts#L1255-L1298",
    "sha256": "9107a2b6447b10c2ecb90429d7c1b80b956759e96d35230af16f5a88f5d3eccd",
    "excerpt": "   * Project visible definitions onto the allowlisted model-facing schema fields,\n   * excluding execution and presentation callbacks.\n   * @param scope - the viewing scope (the agent); omitted = the global view.\n   * @returns one deep-cloned schema per visible tool.\n   */\n  schemas(scope?: ScopeKey): ToolSchema[] {\n    return [...this.view(scope).visible.values()].map(definition => this.schemaOf(definition, true))\n  }\n\n  /** Project visible callable tools onto the generated PTC mode SDK contract. */\n  private sdkSchemas(scope?: ScopeKey): ToolSdkSchema[] {\n    return [...this.view(scope).visible.values()]\n      .filter(definition => definition.name !== RUN_CODE_NAME)\n      .map((definition): ToolSdkSchema => {\n        const output = snapshotJsonValue(definition.output.schema)\n        /* v8 ignore next -- registration already validated and retained this schema as lossless JSON. */\n        if (output === undefined) {\n          throw new Error(`tool \"${definition.name}\" output schema must be lossless JSON before SDK projection`)\n        }\n        return {\n          ...this.schemaOf(definition, true),\n          output,\n        }\n      })\n  }\n\n  /** Project one definition onto the model-facing schema fields. */\n  private schemaOf(definition: ToolDefinition, detachParameters: boolean): ToolSchema {\n    const { name, description, parameters, deferLoading } = definition\n    const detached = detachParameters ? snapshotJsonValue(parameters) : parameters\n    if (detached === undefined) {\n      throw new Error(`tool \"${name}\" parameters must be lossless JSON before schema projection`)\n    }\n    return {\n      name,\n      description,\n      parameters: detached,\n      ...deferLoading === true ? { deferLoading } : {},\n    }\n  }\n\n  /**\n   * Classify a pending call through the caller's visible tool definition. Only\n   * an exact `true` is parallel; unknown, hidden, undeclared, invalid, or"
  },
  {
    "id": "execution",
    "title": "调用调度与执行",
    "path": "packages/core/agent-loop/src/tool-calls.ts",
    "url": "https://github.com/deepseek-ai/DeepSeek-Harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-loop/src/tool-calls.ts#L61-L86",
    "sha256": "5c7e8d8ff0028b436efdd13e5dffa4801d2311c211c3af039e7dab705f87b303",
    "excerpt": "  ctx: Context,\n  turn: number,\n  step: number,\n  toolCalls: ToolCallBlock[],\n  signal: AbortSignal,\n  acceptContext: (context: UserMessage) => void,\n): Promise<{ concluded: boolean }> {\n  const agent = ctx.agents.requireInitiator()\n  const { session } = agent\n\n  // Inputs are distinct because tools/execute wrappers may replace `exec.signal`.\n  const planned: PlannedCall[] = toolCalls.map(block => ({\n    block,\n    exec: {\n      callId: block.id,\n      name: block.name,\n      arguments: parseArguments(block.arguments),\n      agent,\n      signal,\n    },\n  }))\n\n  let next = 0\n  let concluded = false\n  while (next < planned.length) {\n    // Commit before classifying again so registry changes affect unstarted calls."
  },
  {
    "id": "dispatch",
    "title": "先记录调用，再调度执行",
    "path": "packages/core/agent-loop/src/tool-calls.ts",
    "url": "https://github.com/deepseek-ai/DeepSeek-Harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-loop/src/tool-calls.ts#L163-L193",
    "sha256": "5c7e8d8ff0028b436efdd13e5dffa4801d2311c211c3af039e7dab705f87b303",
    "excerpt": "  const inFlight = new Map<number, Promise<number>>()\n\n  const startCall = async (index: number): Promise<void> => {\n    // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded index\n    const call = group[index]!\n    callSeqs[index] = appendToolCall(session, turn, step, call.block)\n    started++\n    const prepared = await ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(call.exec)\n    throwSchedulerFailure()\n    switch (prepared.kind) {\n      case 'dispatch': {\n        const promise = ctx.tools[TOOL_RUNTIME_SCHEDULER].dispatch(prepared.exec).then(\n          (outcome) => {\n            slots[index] = { exec: prepared.exec, result: outcome.result, needsPost: outcome.kind === 'post-result' }\n            return index\n          },\n          (error: unknown) => {\n            schedulerFailure ??= { error }\n            return index\n          },\n        )\n        inFlight.set(index, promise)\n        break\n      }\n      case 'post-result':\n        slots[index] = { exec: prepared.exec, result: prepared.result, needsPost: true }\n        break\n      case 'final-result':\n        slots[index] = { exec: prepared.exec, result: prepared.result, needsPost: false }\n        break\n      /* v8 ignore next -- closed-union exhaustiveness guard */"
  },
  {
    "id": "results",
    "title": "调用结果与日志关联",
    "path": "packages/core/agent-loop/src/tool-calls.ts",
    "url": "https://github.com/deepseek-ai/DeepSeek-Harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-loop/src/tool-calls.ts#L263-L292",
    "sha256": "5c7e8d8ff0028b436efdd13e5dffa4801d2311c211c3af039e7dab705f87b303",
    "excerpt": "function appendToolCall(session: Session, turn: number, step: number, block: ToolCallBlock): SessionSeq {\n  const event = session.append('tool/call', { turn, step, callId: block.id, name: block.name, arguments: block.arguments })\n  return event.seq\n}\n\n/** Append a model-ordered result linked to its call event. */\nfunction appendToolResult(\n  session: Session,\n  turn: number,\n  step: number,\n  block: ToolCallBlock,\n  result: ToolExecutionResult,\n  callSeq: SessionSeq,\n): void {\n  const message = createToolResultMessage({\n    callId: block.id,\n    content: result.content,\n    isError: result.isError,\n  })\n  session.append('tool/result', {\n    turn, step,\n    message,\n    ...result.error?.info ? { error: result.error.info } : {},\n    // The tool's private presentation payload (e.g. a result-time diff),\n    // persisted so a UI bridge reproduces the card on replay.\n    ...result.meta !== undefined ? { meta: result.meta } : {},\n  }, { surfaceOp: 'append', sourceEventSeqs: [callSeq] })\n}"
  }
]
for (const source of sources) source.origin = 'builtin'
export const nodes: StudyNode[] = [
 { id: 'registration', title: '工具如何被模型看到', prerequisite: null,
 prediction: '你认为工具的执行函数会一起发给模型吗？先写下判断和理由。', retryPrediction: '迁移题：新增 timeoutMs 字段，会改变模型看到的 schema 吗？先预测。',
 practice: '在 schemas 和 schemaOf 中追踪一个 hypothetical learny_echo 工具，写出 name、description、parameters 的输入与投影后 JSON，并指出 execute 回调去了哪里。粘贴自己的追踪结果。',
 retryPractice: '为 learny_echo 添加 timeoutMs: 5000、deferLoading: true，给出新的模型 schema 与旧 schema 的差异；指出哪个字段只在宿主生效。',
 explanation: '用自己的话解释：为什么模型可以选择工具，却不能直接执行函数？标明源码位置与一个可能误判。', sourceIds: ['schemas'],
 criteria: [{id:'projection',description:'用源码投影说明模型收到 name、description、parameters，可选 deferLoading，不含执行回调。'}, {id:'trace',description:'给出自己构造的输入与投影 JSON，解释模型选择和宿主执行的职责。'}] },
 { id: 'execution', title: '一次调用如何执行', prerequisite: 'registration',
 prediction: '模型发出工具调用后，原始 arguments 会立刻交给函数吗？调用日志在哪一步记录？', retryPrediction: '迁移题：prepare 返回 final-result 时，是否还会 dispatch？先预测日志与执行顺序。',
 practice: '沿 executeToolCalls → startCall → prepare → dispatch 追踪一次调用，列出原始 JSON、解析后参数、callId、调用事件和执行结果的位置。用一组自己选择的参数演示这条路径。',
 retryPractice: '分别追踪 dispatch 与 final-result 分支，用自己的假设输入列出日志、执行和结果顺序，解释为什么后一个分支不执行 dispatch。',
 explanation: '解释参数解析、调用日志、prepare/dispatch 的顺序与中断时不能默认重跑的原因。', sourceIds: ['execution','dispatch'],
 criteria: [{id:'ordering',description:'追踪原始 arguments 到解析后的 execution 输入，说明先记录 tool/call，再 prepare/dispatch。'}, {id:'dispatch',description:'用自己的实例解释执行分支与 callId，区分没有 dispatch 的结果分支。'}] },
 { id: 'result', title: '结果怎样进入后续推理', prerequisite: 'execution',
 prediction: '工具返回结果后，模型靠什么知道它属于哪次调用？日志引用与 callId 是同一种关联吗？', retryPrediction: '迁移题：两次同名调用的返回内容相同，日志如何区分它们？先作判断。',
 practice: '构造两次不同 callId 的同名调用与结果，写出 tool/call、tool/result 的关键字段，注明每条结果的 sourceEventSeqs 与消息内容。',
 retryPractice: '构造成功与失败各一次调用：追踪 createToolResultMessage、isError、callId 和 sourceEventSeqs；解释不同内容如何成为下一步可见结果。',
 explanation: '用自己的话区分 callId（消息关联）与 sourceEventSeqs（日志来源），说明 content 如何进入有序 surface，以及为什么读到结果不等于掌握任务。', sourceIds: ['results'],
 criteria: [{id:'link',description:'两个实例分别正确关联 callId 与调用事件 seq，区分消息关联和日志来源。'}, {id:'surface',description:'解释 content/isError 与 surfaceOp: append 的作用，提出一个自己的成功/失败实例。'}] },
]
export const hints: Record<string, string[]> = {
 registration: ['从 schemaOf 的解构与 return 对照字段；执行回调不在这个返回值里。', '比较 deferLoading 与 timeoutMs：前者可投影到模型，后者是宿主执行配置。'],
 execution: ['看 startCall 的前三步：appendToolCall、prepare、再 switch；不要把工具请求误认为已执行。', '对照 dispatch、post-result、final-result 分支，有些结果不需要 dispatch。'],
 result: ['分别找 createToolResultMessage 的 callId 和 append 的 sourceEventSeqs，两者指向不同层次。', 'surfaceOp: append 让结果加入有序消息 surface；isError 由执行结果传入。'],
}

export const builtinCourse: StudyCourse = { version: courseVersion, title: 'dsh 的一次工具调用', intro: '追踪一次工具调用：工具发现 → 调用执行 → 结果回传。', nodes, sources }
