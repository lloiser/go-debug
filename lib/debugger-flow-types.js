/* @flow */

export type CommandFinished = {|
  error?: string,
  exited: boolean,
  goroutineID: number
|}

export type ClassyString = string | ClassyString[] | { value: ClassyString, className?: string };
export type Variable = {|
  name: ClassyString,
  hasChildren: boolean,
  value: ClassyString,
  parentPath: string,
  type: string
|}

export type Variables = {
  [key: string]: Variable,
}

export type Stacktrace = {|
  id: number,
  file: string,
  line: number,
  func: string,
  variables?: ?Variables
|}
export type Goroutine = {|
  id: number,
  file: string,
  line: number,
  func: string
|}
export type Breakpoint = {|
  id: number,
  name: string,
  file: string,
  line: number,
  state: 'notStarted' | 'waiting' | 'busy' | 'valid' | 'error',
  message: ?string,
  cond: ?string
|}
export type WatchExpression = {|
  expr: string,
  variables: Variables
|}

export type OutputContentMessage = {| type: 'message', message: string |}
export type OutputContentEval = {| type: 'eval', variables: Variables |}
export type OutputContentDelveSpawnOptions = {|
  type: 'dlvSpawnOptions',
  path: string,
  args: string[],
  cwd: string,
  env: { [key: string]: string }
|}
export type OutputContent = OutputContentMessage | OutputContentEval | OutputContentDelveSpawnOptions

export type Configuration = {|
  name: string,
  mode: 'debug' | 'test' | 'remote' | 'exec' | 'attach',
  args?: string[],
  env?: { [key: string]: string },
  cwd?: string,
  host?: string,
  port?: number,
  program?: string,
  buildFlags?: string,
  init?: string,
  showLog?: boolean
|}

export type ConfigurationFile = {|
  file: string,
  configs: Configuration[]
|}

declare type internal$Stacktrace = Stacktrace

export type StateDelve = {|
  stacktrace: internal$Stacktrace[],
  goroutines: Goroutine[],
  breakpoints: Breakpoint[],
  selectedStacktrace: number,
  selectedGoroutine: number,
  watchExpressions: WatchExpression[]
|}

export type DebuggerState = 'notStarted' | 'starting' | 'waiting' | 'running' | 'busy'

export type State = {|
  delve: StateDelve,
  state: DebuggerState,
  output: {|
    content: OutputContent[]
  |},
  selectedConfig: string,
  configurations: ConfigurationFile[]
|}

export type SerializedBreakpoint = {|
  file: string,
  line: number,
  cond: ?string
|}
export type SerializedStateDelve = {|
  breakpoints: SerializedBreakpoint[]
|}

export type SerializedState = {|
  selectedConfig: string,
  delve: SerializedStateDelve,
|}
