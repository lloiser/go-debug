/* @flow */

import { getDeep } from './utils'

import type { Store } from './store'
import type { State, SerializedState, SerializedBreakpoint, Breakpoint, DebuggerState } from './debugger-flow-types'

export function serialize (store: Store): SerializedState {
  const state = store.getState()
  const mapBP = ({ file, line, cond }): SerializedBreakpoint => {
    return { file, line, cond }
  }
  return {
    selectedConfig: state.selectedConfig,
    delve: {
      breakpoints: state.delve.breakpoints.map(mapBP)
    }
  }
}

export function getBreakpoints (store: Store, file?: string): Breakpoint[] {
  const bps = store.getState().delve.breakpoints
  return file == null ? bps : bps.filter((bp) => bp.file === file)
}

export function indexOfBreakpoint (bps: Breakpoint[], file: string, line: number): number {
  return bps.findIndex((bp) => bp.file === file && bp.line === line)
}
export function indexOfBreakpointByName (bps: Breakpoint[], name: string): number {
  return bps.findIndex((bp) => bp.name === name)
}

export function getBreakpoint (store: Store, file: string, line: number): ?Breakpoint {
  const bps = getBreakpoints(store, file)
  const index = indexOfBreakpoint(bps, file, line)
  return index === -1 ? null : bps[index]
}
export function getBreakpointByName (store: Store, name: string): ?Breakpoint {
  const bps = getBreakpoints(store)
  const index = indexOfBreakpointByName(bps, name)
  return index === -1 ? null : bps[index]
}

export function isStarted (v: DebuggerState | Store) {
  const state: DebuggerState = typeof v === 'string' ? v : getState(v)
  return state !== 'notStarted' && state !== 'starting'
}
export function isBusy (v: DebuggerState | Store) {
  const state: DebuggerState = typeof v === 'string' ? v : getState(v)
  return state === 'busy' || state === 'running'
}
export function getState (store: Store) {
  return store.getState().state
}

export function subscribePath (store: Store, path: string, callback: (nv: ?any, ov: ?any) => void) {
  let currentValue

  const update = () => {
    const newValue = getDeep(store.getState(), path)
    if (newValue !== currentValue) {
      callback(newValue, currentValue)
      currentValue = newValue
    }
  }

  update()

  return { dispose: store.subscribe(update) }
}

export function subscribeFn<Out> (store: Store, fn: (state: State) => ?Out, callback: (nv: ?Out, ov: ?Out) => void) {
  let currentValue

  const update = () => {
    const newValue = fn(store.getState())
    if (newValue !== currentValue) {
      callback(newValue, currentValue)
      currentValue = newValue
    }
  }

  update()

  return { dispose: store.subscribe(update) }
}
