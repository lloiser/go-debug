'use babel'

import { createStore, combineReducers } from 'redux'
import { indexOfBreakpoint, indexOfBreakpointByName } from './store-utils'

const assign = (...items) => Object.assign({}, ...items)

function updateArrayItem (array, index, o) {
  return array.slice(0, index).concat(
    assign(array[index], o),
    array.slice(index + 1)
  )
}

function stacktrace (state = [], action) {
  switch (action.type) {
    case 'RESTART':
    case 'STOP':
      return []

    case 'UPDATE_STACKTRACE':
      // attempt to copy the variables over to the new stacktrace
      return action.stacktrace.map((stack) => {
        const existingStack = state.find((st) => st.id === stack.id)
        if (!stack.variables && existingStack) {
          stack.variables = existingStack.variables
        }
        return stack
      })

    case 'UPDATE_VARIABLES':
      var variables = state[action.stacktraceIndex].variables
      if (action.path) {
        // update the variable at "path" to loaded
        variables = assign(variables, {
          [action.path]: assign(variables[action.path], { loaded: true })
        })
      }

      variables = assign(variables, action.variables)
      return updateArrayItem(state, action.stacktraceIndex, { variables: variables })
  }
  return state
}
function goroutines (state = [], action) {
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
function breakpoints (state = [], action) {
  let { bp } = action
  const { name, file, line } = bp || {}
  const index = name ? indexOfBreakpointByName(state, name) : indexOfBreakpoint(state, file, line)
  switch (action.type) {
    case 'ADD_BREAKPOINT':
      if (index === -1) {
        bp.name = 'bp' + bpNamePostfix++
        return state.concat(bp).sort(breakpointSorter)
      }
      return state

    case 'REMOVE_BREAKPOINT':
      return index === -1 ? state : state.slice(0, index).concat(state.slice(index + 1))

    case 'EDIT_BREAKPOINT':
      if (index !== -1) {
        if (bp.state !== 'error') {
          bp = assign(bp, { message: null })
        }
        return updateArrayItem(state, index, bp)
      }
      return state

    case 'STOP':
      return state.map((bp) => {
        const changes = { state: 'notStarted' }
        if (bp.state === 'error') {
          changes.message = null
        }
        return assign(bp, changes)
      })

    case 'INIT_STORE':
      return state.map((bp) => {
        return assign(bp, { name: 'bp' + bpNamePostfix++, state: 'notStarted' })
      }).sort(breakpointSorter)
  }

  return state
}
function state (state = 'notStarted', action) {
  switch (action.type) {
    case 'STOP':
      return 'notStarted'

    case 'RESTART':
      return 'started'

    case 'SET_STATE':
      return action.state
  }
  return state
}
function selectedStacktrace (state = 0, action) {
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
function selectedGoroutine (state = 0, action) {
  switch (action.type) {
    case 'RESTART':
    case 'STOP':
      return 0

    case 'SET_SELECTED_GOROUTINE':
      return action.id
  }
  return state
}

const delve = combineReducers({
  stacktrace,
  goroutines,
  breakpoints,
  state,
  selectedStacktrace,
  selectedGoroutine
})

function selectedConfig (state = '', action) {
  switch (action.type) {
    case 'SET_SELECTED_CONFIG':
      return action.configName || ''
  }
  return state
}
function configurations (state = [], action) {
  if (action.type === 'SET_CONFIGURATION') {
    return action.configurations
  }
  return state
}

export default function (state) {
  if (state && state.panel) {
    delete state.panel
  }

  const store = createStore(combineReducers({
    delve,
    selectedConfig,
    configurations
  }), state)

  // init the store (upgrades the previous state so it is usable again)
  store.dispatch({ type: 'INIT_STORE' })

  return store
}
