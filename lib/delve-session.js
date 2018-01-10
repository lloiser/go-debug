/* @flow */

import * as DelveVariables from './delve-variables'

import type {
  DelveDebuggerState,
  DelveStackframe, DelveGoroutine,
  DelveBreakpoint,
  DelveVariable, DelveVariableShadowed,
  DelveLoadConfig, DelveEvalScope
} from './delve-flow-types'
import type { CommandFinished, Stacktrace, Goroutine, Variables, Breakpoint } from './debugger-flow-types'
import type { ChildProcess } from 'child_process'
import type { RPCConnection } from './delve-connection'

const RPC_ENDPOINT = 'RPCServer.'

// note: mimic the "full" flag in the "Stacktrace" call
const defaultVariableCfg: DelveLoadConfig = {
  followPointers: true,
  maxVariableRecurse: 1,
  maxStringLen: 64,
  maxArrayValues: 64,
  maxStructFields: -1
}

const VariableShadowed: DelveVariableShadowed = 2

export class DelveSession {
  _process: ?ChildProcess
  _connection: RPCConnection
  _mode: string

  _stopPromise: ?Promise<void>

  constructor (process: ChildProcess, connection: RPCConnection, mode: string) {
    this._process = process
    this._connection = connection
    this._mode = mode
  }

  stop (requiresHalt: boolean): Promise<void> {
    if (!this._connection) {
      return Promise.resolve()
    }
    if (this._stopPromise) {
      return this._stopPromise
    }

    let id
    const kill = () => {
      clearTimeout(id)
      if (this._connection) {
        this._connection.end()
      }
      delete this._connection
      if (this._process) {
        this._process.kill()
      }
      this._process = null
      this._stopPromise = null
    }

    let prom
    if (this._mode === 'attach') {
      prom = this._call('Detach', { kill: false })
    } else {
      prom = Promise.resolve()
      if (requiresHalt) {
        prom = this.halt()
      }
      prom.then(() => {
        return this._call('Detach', { kill: true })
      })
    }

    const timeoutProm = new Promise((resolve, reject) => {
      id = setTimeout(() => {
        resolve()
      }, 5000)
    })

    this._stopPromise = Promise.race([
      prom,
      timeoutProm
    ]).then(kill).catch(kill)
    return this._stopPromise
  }

  addBreakpoint ({ bp }: { bp: Breakpoint }): Promise<{ id: number }> {
    const breakpoint = sanitizeBreakpoint(bp)

    return this._call('CreateBreakpoint', { breakpoint })
      .then((o: { Breakpoint: DelveBreakpoint }) => {
        return { id: o.Breakpoint.id }
      })
  }

  removeBreakpoint ({ bp }: { bp: Breakpoint }): Promise<void> {
    return this._call('ClearBreakpoint', { id: bp.id })
  }

  editBreakpoint ({ bp }: { bp: Breakpoint }): Promise<void> {
    const breakpoint = sanitizeBreakpoint(bp)
    return this._call('AmendBreakpoint', { breakpoint })
  }

  resume () {
    return this._command('continue')
  }
  next () {
    return this._command('next')
  }
  stepIn () {
    return this._command('step')
  }
  stepOut () {
    return this._command('stepOut')
  }
  halt () {
    return this._command('halt')
  }

   // _command executes the given command (like continue, step, next, ...)
  _command (name: string): Promise<CommandFinished> {
    return this._call('Command', { name }).then((o: { State: DelveDebuggerState }) => {
      const { State } = o
      // stopping a running program which is not halted at the moment
      // (so waiting for further debug commands like 'continue' or 'step')
      // ends up here too, so simply return that it already has stopped
      const exited = this._stopPromise ? true : !!State.exited
      let goroutineID = -1
      if (!exited) {
        goroutineID = State.currentGoroutine ? State.currentGoroutine.id : -1
        if (goroutineID === -1) {
          goroutineID = State.currentThread ? State.currentThread.goroutineID : -1
        }
      }
      return {
        exited,
        goroutineID
      }
    })
  }

   // restart the delve session
  restart (): Promise<void> {
    return this._call('Restart')
  }

  selectStacktrace (o: { index: number }): Promise<void> {
    void o // nothing special to do here ...
    return Promise.resolve()
  }
  getStacktrace (o: { goroutineID: number }): Promise<Stacktrace[]> {
    const args = {
      id: o.goroutineID,
      depth: 20
    }
    return this._call('Stacktrace', args)
      .then(this._prepareStacktrace.bind(this))
  }
  _prepareStacktrace (o: { Locations: DelveStackframe[] }): Stacktrace[] {
    return o.Locations.map((stack) => {
      return {
        id: stack.pc,
        file: stack.file,
        line: stack.line - 1, // delve = 1 indexed line / atom = 0 indexed line
        func: stack.function.name.split('/').pop()
      }
    })
  }

  selectGoroutine (o: { id: number }): Promise<void> {
    return this._call('Command', { name: 'switchGoroutine', goroutineID: o.id })
  }
  getGoroutines (): Promise<Goroutine[]> {
    return this._call('ListGoroutines')
      .then(this._prepareGoroutines.bind(this))
  }
  _prepareGoroutines (o: { Goroutines: DelveGoroutine[] }): Goroutine[] {
    return o.Goroutines.map((goroutine) => {
      let loc = goroutine.userCurrentLoc
      if (!loc.function || !loc.function.name) {
        loc = goroutine.currentLoc
      }
      if (!loc.function || !loc.function.name) {
        return null
      }
      return {
        id: goroutine.id,
        file: loc.file,
        line: loc.line - 1, // dlv = 1 indexed line / atom = 0 indexed line
        func: loc.function.name.split('/').pop()
      }
    }).filter(Boolean)
  }

  getVariables (scope: DelveEvalScope, cfg: DelveLoadConfig = defaultVariableCfg): Promise<Variables> {
    return Promise.all([
      this._getLocalVariables(scope, cfg),
      this._getFunctionArguments(scope, cfg)
    ]).then(([locals, args]) => {
      // note: workaround for github.com/derekparker/delve/issues/951
      // check the args if they contain variables that also exist in
      // the local variables. if so mark them as shadowed (flag & 2)
      args.forEach((arg) => {
        if (locals.find((local) => local.name === arg.name)) {
          arg.flags |= VariableShadowed
        }
      })
      const vars = locals.concat(args)
        // variable is shadowed by another one, skip it
        .filter((v) => ((v.flags & VariableShadowed) === 0)
      )
      return DelveVariables.create(vars)
    })
  }
  _getLocalVariables (scope: DelveEvalScope, cfg: DelveLoadConfig): Promise<DelveVariable[]> {
    return this._call('ListLocalVars', { scope, cfg }).then((o: { Variables: DelveVariable[] }) => o.Variables)
  }
  _getFunctionArguments (scope: DelveEvalScope, cfg: DelveLoadConfig): Promise<DelveVariable[]> {
    return this._call('ListFunctionArgs', { scope, cfg }).then((o: { Args: DelveVariable[] }) => o.Args)
  }

  evaluate (o: { expr: string, scope: DelveEvalScope }): Promise<Variables> {
    return this._call('Eval', o)
      .then((result) => {
        return DelveVariables.create([result.Variable])
      })
      .catch((err) => {
        return DelveVariables.createError(err, o.expr)
      })
  }

  // call is the base method for all calls to delve
  _call<T> (method: string, ...args: mixed[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const endpoint = RPC_ENDPOINT + method
      this._connection.call(endpoint, args, (err, result) => {
        if (err) {
          reject(err)
          return
        }
        resolve(result)
      })
    })
  }
}

function sanitizeBreakpoint (bp: Breakpoint): DelveBreakpoint {
  // only keep those props that delve knows
  const { id, name, file, line, cond } = bp

  return {
    id,
    name,
    file,
    line: line+1, // note: delve = 1 indexed line numbers / atom = 0 indexed line numbers
    cond
  }
}
