/* @flow */

import * as redux from 'redux'
import { indexOfBreakpoint, indexOfBreakpointByName } from './store-utils'
import { assign, updateArrayItem, removeArrayItem } from './utils'
import * as Actions from './store-actions'

import type { Store as ReduxStore } from 'redux'

import type {
  State, DebuggerState, Stacktrace, Goroutine, Breakpoint, WatchExpression, Variables,
  OutputContent,
  ConfigurationFile,
  SerializedState
} from './debugger-flow-types'

export type Store = ReduxStore<State, Actions.Actions>;

function stacktrace (state: Stacktrace[] = [], action: Actions.Actions): Stacktrace[] {
  switch (action.type) {
    case 'RESTART':
    case 'STOP':
      return []

    case 'UPDATE_STACKTRACE':
      // attempt to copy the variables over to the new stacktrace
      return action.stacktrace.map((stack) => {
        const existingStack = state.find((st, i) => i > 0 && st.id === stack.id)
        if (!stack.variables && existingStack) {
          stack.variables = existingStack.variables
        }
        return stack
      })

    case 'UPDATE_STACKTRACE_VARIABLES': {
      return updateArrayItem(state, action.stacktraceIndex, { variables: action.variables })
    }
  }
  return state
}
function goroutines (state: Goroutine[] = [], action: Actions.Actions): Goroutine[] {
  switch (action.type) {
    case 'RESTART':
    case 'STOP':
      return []

    case 'UPDATE_GOROUTINES':
      return action.goroutines
  }
  return state
}
let bpNamePostfix = 0
let breakpointSorter = (a, b) => {
  const s = a.file.localeCompare(b.file)
  return s !== 0 ? s : (a.line - b.line)
}
function breakpoints (state: Breakpoint[] = [], action: Actions.Actions): Breakpoint[] {
  switch (action.type) {
    case 'ADD_BREAKPOINT': {
      const { file, line } = action.bp
      let index = indexOfBreakpoint(state, file, line)
      if (index === -1) {
        return state.concat(assign(action.bp, { name: 'bp' + bpNamePostfix++ })).sort(breakpointSorter)
      }
      return state
    }
    case 'REMOVE_BREAKPOINT': {
      let index = indexOfBreakpointByName(state, action.name)
      return removeArrayItem(state, index)
    }
    case 'EDIT_BREAKPOINT': {
      let { bp } = action
      let index = indexOfBreakpointByName(state, action.bp.name)
      if (index !== -1) {
        if (bp.state !== 'error') {
          bp = assign(bp, { message: null })
        }
        return updateArrayItem(state, index, bp)
      }
      return state
    }
    case 'STOP': {
      return state.map((bp) => {
        const changes: $Shape<Breakpoint> = { state: 'notStarted' }
        if (bp.state === 'error') {
          changes.message = null
        }
        return assign(bp, changes)
      })
    }
  }

  return state
}
function selectedStacktrace (state: number = 0, action: Actions.Actions): number {
  switch (action.type) {
    case 'RESTART':
    case 'STOP':
      return 0

    case 'SET_SELECTED_STACKTRACE':
      return action.index

    case 'UPDATE_STACKTRACE':
      return 0 // set back to the first function on each update
  }
  return state
}
function selectedGoroutine (state: number = 0, action: Actions.Actions): number {
  switch (action.type) {
    case 'RESTART':
    case 'STOP':
      return 0

    case 'SET_SELECTED_GOROUTINE':
      return action.id
  }
  return state
}
const defaultWatchExpressionVariables = (expr: string): Variables => {
  return {
    [expr]: {
      name: expr,
      hasChildren: false,
      value: '<not available>',
      parentPath: '',
      type: 'string'
    }
  }
}
function watchExpressions (state: WatchExpression[] = [], action: Actions.Actions): WatchExpression[] {
  switch (action.type) {
    case 'RESTART':
    case 'STOP':
      return state.map((o) => assign(o, { variables: defaultWatchExpressionVariables(o.expr) }))

    case 'ADD_WATCH_EXPRESSION':
      return state.concat({
        expr: action.expr,
        variables: defaultWatchExpressionVariables(action.expr)
      })

    case 'REMOVE_WATCH_EXPRESSION': {
      const index = state.findIndex((o) => o.expr === action.expr)
      return removeArrayItem(state, index)
    }

    case 'SET_WATCH_EXPRESSION_VARIABLES': {
      const index = state.findIndex((o) => o.expr === action.expr)
      return updateArrayItem(state, index, {
        variables: action.variables
      })
    }
  }
  return state
}

const delve = redux.combineReducers({
  stacktrace,
  goroutines,
  breakpoints,
  selectedStacktrace,
  selectedGoroutine,
  watchExpressions
})

function state (state: DebuggerState = 'notStarted', action: Actions.Actions): DebuggerState {
  switch (action.type) {
    case 'STOP':
      return 'notStarted'

    case 'RESTART':
      return 'waiting'

    case 'SET_STATE':
      return action.state
  }
  return state
}

function content (state: OutputContent[] = [], action: Actions.Actions): OutputContent[] {
  switch (action.type) {
    case 'CLEAR_OUTPUT_CONTENT':
      return []

    case 'ADD_OUTPUT_CONTENT':
      return state.concat(action.content)
  }
  return state
}

const output = redux.combineReducers({
  content
})

function selectedConfig (state: string = '', action: Actions.Actions): string {
  switch (action.type) {
    case 'SET_SELECTED_CONFIG':
      return action.configName || ''
  }
  return state
}
function configurations (state: ConfigurationFile[] = [], action: Actions.Actions): ConfigurationFile[] {
  if (action.type === 'SET_CONFIGURATIONS') {
    return action.configurations
  }
  return state
}

export function createStore (initialState: ?SerializedState): Store {
  const store: Store = redux.createStore(redux.combineReducers({
    delve,
    state,
    output,
    selectedConfig,
    configurations
  }))

  if (initialState) {
    // apply the initialState
    store.dispatch(Actions.setSelectedConfig(initialState.selectedConfig))
    if (initialState.delve) {
      (initialState.delve.breakpoints || []).forEach((bp) => {
        store.dispatch(Actions.addBreakpoint(bp))
      })
    }
  }

  return store
}
