/* @flow */

import type {
  DebuggerState, Stacktrace, Goroutine, Breakpoint, Variables, ConfigurationFile, OutputContent
} from './debugger-flow-types'

//
//
//

export type ActionStop = {| type: 'STOP' |}
export function stop (): ActionStop {
  return { type: 'STOP' }
}

export type ActionRestart = {| type: 'RESTART' |}
export function restart (): ActionRestart {
  return { type: 'RESTART' }
}

export type ActionSetState = {|
  type: 'SET_STATE',
  state: DebuggerState
|}
export function setState (state: DebuggerState): ActionSetState {
  return { type: 'SET_STATE', state }
}

//
// Breakpoints
//

export type ActionAddBreakpoint = {|
  type: 'ADD_BREAKPOINT',
  bp: $Shape<Breakpoint>
|}
export function addBreakpoint (bp: $Shape<Breakpoint>): ActionAddBreakpoint {
  return { type: 'ADD_BREAKPOINT', bp }
}

export type ActionRemoveBreakpoint = {|
  type: 'REMOVE_BREAKPOINT',
  name: string
|}
export function removeBreakpoint (name: string): ActionRemoveBreakpoint {
  return { type: 'REMOVE_BREAKPOINT', name }
}

export type ActionEditBreakpoint = {|
  type: 'EDIT_BREAKPOINT',
  bp: $Shape<Breakpoint>
|}
export function editBreakpoint (bp: $Shape<Breakpoint>): ActionEditBreakpoint {
  return { type: 'EDIT_BREAKPOINT', bp }
}

export type ActionsBreakpoints = ActionAddBreakpoint | ActionRemoveBreakpoint | ActionEditBreakpoint

//
// Stacktraces
//

export type ActionUpdateStacktrace = {|
  type: 'UPDATE_STACKTRACE',
  stacktrace: Stacktrace[]
|}
export function updateStacktrace (stacktrace: Stacktrace[]): ActionUpdateStacktrace {
  return { type: 'UPDATE_STACKTRACE', stacktrace }
}

export type ActionUpdateStacktraceVariables = {|
  type: 'UPDATE_STACKTRACE_VARIABLES',
  stacktraceIndex: number,
  variables: Variables
|}
export function updateStacktraceVariables (index: number, variables: Variables): ActionUpdateStacktraceVariables {
  return { type: 'UPDATE_STACKTRACE_VARIABLES', stacktraceIndex: index, variables }
}

export type ActionSelectStacktrace = {|
  type: 'SET_SELECTED_STACKTRACE',
  index: number
|}
export function selectStacktrace (index: number): ActionSelectStacktrace {
  return { type: 'SET_SELECTED_STACKTRACE', index }
}

export type ActionsStacktrace = ActionUpdateStacktrace | ActionUpdateStacktraceVariables | ActionSelectStacktrace

//
// Goroutines
//

export type ActionUpdateGoroutines = {|
  type: 'UPDATE_GOROUTINES',
  goroutines: Goroutine[]
|}
export function updateGoroutines (goroutines: Goroutine[]): ActionUpdateGoroutines {
  return { type: 'UPDATE_GOROUTINES', goroutines }
}

export type ActionSelectGoroutine = {|
  type: 'SET_SELECTED_GOROUTINE',
  id: number
|}
export function selectGoroutine (id: number): ActionSelectGoroutine {
  return { type: 'SET_SELECTED_GOROUTINE', id }
}

export type ActionsGoroutines = ActionUpdateGoroutines | ActionSelectGoroutine

//
// WatchExpressions
//

export type ActionAddWatchExpression = {|
  type: 'ADD_WATCH_EXPRESSION',
  expr: string
|}
export function addWatchExpression (expr: string): ActionAddWatchExpression {
  return { type: 'ADD_WATCH_EXPRESSION', expr }
}

export type ActionRemoveWatchExpression = {|
  type: 'REMOVE_WATCH_EXPRESSION',
  expr: string
|}
export function removeWatchExpression (expr: string): ActionRemoveWatchExpression {
  return { type: 'REMOVE_WATCH_EXPRESSION', expr }
}

export type ActionSetWatchExpressionVariables = {|
  type: 'SET_WATCH_EXPRESSION_VARIABLES',
  expr: string,
  variables: Variables
|}
export function setWatchExpressionVariables (expr: string, variables: Variables): ActionSetWatchExpressionVariables {
  return { type: 'SET_WATCH_EXPRESSION_VARIABLES', expr, variables }
}

export type ActionsWatchExpressions = ActionAddWatchExpression | ActionRemoveWatchExpression | ActionSetWatchExpressionVariables

//
// Output
//

export type ActionAddOutputContent = {|
  type: 'ADD_OUTPUT_CONTENT',
  content: OutputContent
|}
export function addOutputMessage (message: string): ActionAddOutputContent {
  return {
    type: 'ADD_OUTPUT_CONTENT',
    content: {
      type: 'message',
      message
    }
  }
}
export function addOutputEvalVariables (variables: Variables): ActionAddOutputContent {
  return {
    type: 'ADD_OUTPUT_CONTENT',
    content: { type: 'eval', variables }
  }
}
export function addOutputDelveSpawnOptions (
  path: string, args: string[], cwd: string, env: { [key: string]: string }
): ActionAddOutputContent {
  return {
    type: 'ADD_OUTPUT_CONTENT',
    content: { type: 'dlvSpawnOptions', path, args, cwd, env }
  }
}

export type ActionClearOutputContent = {| type: 'CLEAR_OUTPUT_CONTENT' |}
export function clearOutputContent (): ActionClearOutputContent {
  return { type: 'CLEAR_OUTPUT_CONTENT' }
}

export type ActionsOutput = ActionAddOutputContent | ActionClearOutputContent

//
// Configuration
//

export type ActionSetSelectedConfig = {|
  type: 'SET_SELECTED_CONFIG',
  configName: string
|}
export function setSelectedConfig (configName: string): ActionSetSelectedConfig {
  return { type: 'SET_SELECTED_CONFIG', configName }
}
export type ActionSetConfigurations = {|
  type: 'SET_CONFIGURATIONS',
  configurations: ConfigurationFile[]
|}
export function setConfigurations (configurations: ConfigurationFile[]): ActionSetConfigurations {
  return { type: 'SET_CONFIGURATIONS', configurations }
}

export type ActionsConfiguration = ActionSetSelectedConfig | ActionSetConfigurations

//
// All together
//

export type Actions = ActionStop | ActionRestart | ActionSetState | ActionsBreakpoints | ActionsStacktrace | ActionsGoroutines | ActionsWatchExpressions | ActionsOutput | ActionsConfiguration
