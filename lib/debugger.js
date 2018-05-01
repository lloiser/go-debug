/* @flow */

import { getBreakpoint, getBreakpoints, getBreakpointByName, getState, isStarted, isBusy } from './store-utils'
import { location, assign } from './utils'
import * as Actions from './store-actions'

import type { Store } from './store'
import type { DebuggerState, Breakpoint, Configuration, Variables } from './debugger-flow-types'
import type { DelveSession } from './delve-session'
import type { DelveConnection } from './delve-connection'

export class Debugger {
  _store: Store
  _connection: DelveConnection
  _session: ?DelveSession
  _stopPromise: ?Promise<void>

  constructor (store: Store, connection: DelveConnection) {
    this._store = store
    this._connection = connection
    this._session = null
    this._stopPromise = null
  }

  dispose () {
    this.stop()
  }

  /**
   * Starts a new debugging session.
   * @param  {object} config The config used to start the debugger.
   * @param  {string} file   The file to debug
   * @return {Promise}
   */
  start (config: Configuration, file: ?string): Promise<void> {
    if (isStarted(this._store) || getState(this._store) === 'starting') {
      return Promise.resolve()
    }

    if (!config) {
      this._store.dispatch(Actions.addOutputMessage('Please select a configuration in the debugger panel on the right.\n'))
      return Promise.resolve()
    }

    this._store.dispatch(Actions.setState('starting'))

    // clear the output panel
    if (atom.config.get('go-debug.clearOutputOnStart') === true) {
      this._store.dispatch(Actions.clearOutputContent())
    }

    // start the debugger
    this._store.dispatch(Actions.addOutputMessage(`Starting delve with config "${config.name}"\n`))

    return this._connection.start({ config, file })
      .then((session) => {
        this._store.dispatch(Actions.addOutputMessage(`Started delve with config "${config.name}"\n`))
        this._store.dispatch(Actions.setState('waiting'))

        this._session = session

        return Promise.all(
          getBreakpoints(this._store).map((bp) => {
            return this.addBreakpoint(bp.file, bp.line)
          })
        ).then(() => {
          // TODO if !config.stopOnEntry
          return this.resume()
        })
      })
      .catch((err) => {
        console.warn('go-debug', 'start', err)
        this._store.dispatch(Actions.addOutputMessage(`Failed to start delve with config "${config.name}"\r\n  Error: ${err}\n`))
        return this.stop()
      })
  }

  /**
   * Stops a debugging session.
   * @return {Promise}
   */
  stop (): Promise<void> {
    if (!isStarted(this._store)) {
      return Promise.resolve()
    }
    const session = this._session
    if (!session) {
      return Promise.resolve()
    }
    if (!this._stopPromise) {
      // the debugger is currently running the program
      // so halt it before we can stop it
      const requiresHalt = isBusy(this._store)
      this._stopPromise = session.stop(requiresHalt)
        .then(() => {
          this._stopPromise = null
          this._session = null
          this._store.dispatch(Actions.stop())
        })
    }
    return this._stopPromise
  }

  /**
   * Adds a new breakpoint to the given file and line
   * @param {string} file
   * @param {number} line
   * @return {Promise}
   */
  addBreakpoint (file: string, line: number): Promise<void> {
    const session = this._session
    if (!isStarted(this._store) || !session) {
      this._store.dispatch(Actions.addBreakpoint({ file, line, state: 'notStarted' }))
      return Promise.resolve()
    }

    let existingBP = getBreakpoint(this._store, file, line)
    if (existingBP && existingBP.state === 'busy') {
      // already being added
      return Promise.resolve()
    }

    if (!existingBP) {
      this._store.dispatch(Actions.addBreakpoint({ file, line, state: 'busy' }))
    } else {
      this._store.dispatch(Actions.editBreakpoint({ name: existingBP.name, state: 'busy' }))
    }
    const bp = getBreakpoint(this._store, file, line)
    if (!bp) {
      return Promise.resolve()
    }

    const fileAndLine = location(bp)

    return session.addBreakpoint({ bp })
      .then(({ id }) => {
        this._store.dispatch(Actions.editBreakpoint({ ...bp, state: 'valid', id }))
      })
      .catch((err) => {
        this._store.dispatch(Actions.addOutputMessage(`Adding breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`))
        this._store.dispatch(Actions.editBreakpoint({ ...bp, state: 'error', message: err }))
      })
  }

  /**
   * Removes a breakpoint
   * @param {string} name
   * @return {Promise}
   */
  removeBreakpoint (name: string): Promise<void> {
    const bp = getBreakpointByName(this._store, name)
    if (!bp) {
      return Promise.resolve()
    }

    const done = () => {
      this._store.dispatch(Actions.removeBreakpoint(name))
    }

    const session = this._session
    if (bp.state === 'error' || !isStarted(this._store) || !session) {
      return Promise.resolve().then(done)
    }

    const fileAndLine = location(bp)

    this._store.dispatch(Actions.editBreakpoint({ ...bp, state: 'busy' }))

    return session.removeBreakpoint({ bp })
      .then(done)
      .catch((err) => {
        this._store.dispatch(Actions.addOutputMessage(`Removing breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`))
        this._store.dispatch(Actions.editBreakpoint({ ...bp, state: 'error', message: err }))
      })
  }

  /**
   * Adds or removes a breakpoint for the given file and line.
   * @param {string} file
   * @param {number} line
   * @return {Promise}
   */
  toggleBreakpoint (file: string, line: number): Promise<void> {
    const bp = getBreakpoint(this._store, file, line)
    if (!bp) {
      return this.addBreakpoint(file, line)
    }
    return this.removeBreakpoint(bp.name)
  }

  editBreakpoint (name: string, changes: $Shape<Breakpoint>): Promise<void> {
    const bp = getBreakpointByName(this._store, name)
    if (!bp) {
      return Promise.resolve()
    }

    const newBP: Breakpoint = assign(bp, changes)

    const edit = (bp: Breakpoint) => {
      this._store.dispatch(Actions.editBreakpoint(bp))
    }
    const session = this._session
    if (!isStarted(this._store) || !session) {
      // apply the changes immediately
      edit(newBP)
      return Promise.resolve()
    }

    if (!bp.id) {
      return this.addBreakpoint(bp.file, bp.line)
    }

    this._store.dispatch(Actions.editBreakpoint({ ...newBP, state: 'busy' }))
    return session.editBreakpoint({ bp: newBP })
      .then(() => {
        edit(assign(newBP, { state: 'valid' }))
      })
      .catch((err) => {
        const fileAndLine = location(bp)
        this._store.dispatch(Actions.addOutputMessage(`Updating breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`))
        edit(assign(bp, { state: 'error', message: err }))
      })
  }

  /**
   * Resumes the current debugger.
   * @return {Promise}
   */
  resume (): Promise<void> {
    return this.continueExecution('resume')
  }

  /**
   * Halts the current debugger.
   * @return {Promise}
   */
  halt (): Promise<void> {
    return this.continueExecution('halt')
  }

  /**
   * Step the current debugger to the next line.
   * @return {Promise}
   */
  next (): Promise<void> {
    return this.continueExecution('next')
  }

  /**
   * Step the current debugger into the current function/instruction.
   * @return {Promise}
   */
  stepIn (): Promise<void> {
    return this.continueExecution('stepIn')
  }

  /**
   * Step the current debugger out of the current function/instruction.
   * @return {Promise}
   */
  stepOut (): Promise<void> {
    return this.continueExecution('stepOut')
  }

  continueExecution (fn: 'resume' | 'halt' | 'next' | 'stepIn' | 'stepOut'): Promise<void> {
    const session = this._session
    if (!isStarted(this._store) || !session) {
      return Promise.resolve()
    }

    if (fn !== 'halt' && isBusy(this._store)) {
      return Promise.resolve()
    }

    const fns = {
      resume: () => session.resume(),
      halt: () => session.halt(),
      next: () => session.next(),
      stepIn: () => session.stepIn(),
      stepOut: () => session.stepOut()
    }

    // clear the existing stacktrace and goroutines if the next delve
    // request takes too long.
    const id = setTimeout(() => {
      this._store.dispatch(Actions.updateStacktrace([]))
      this._store.dispatch(Actions.updateGoroutines([]))
    }, 500)

    return this._updateState(
      () => fns[fn]().catch((err) => {
        this._store.dispatch(Actions.addOutputMessage(`Failed to ${fn}!\r\n  Error: ${err}\n`))
        return null
      }),
      'running'
    ).then((newState) => {
      clearTimeout(id)
      if (!newState) {
        return
      }
      if (newState.error != null && newState.error !== '') {
        this._store.dispatch(Actions.addOutputMessage(`Failed to ${fn}!\r\n  Error: ${newState.error}\n`))
      }
      if (newState.exited) {
        return this.stop()
      }
      return this.getGoroutines() // get the new goroutines
        .then(() => this.selectGoroutine(newState.goroutineID)) // select the current goroutine
    }).then(() => {})
  }

  /**
   * Restarts the current debugger.
   * @return {Promise}
   */
  restart (): Promise<void> {
    if (!isStarted(this._store) || !this._session) {
      return Promise.resolve()
    }
    return this._session.restart().then(() => {
      this._store.dispatch(Actions.restart())
      // immediately start the execution (like "start" does)
      this.resume()
    })
  }

  /**
   * Selects the given stacktrace of the current debugger.
   * @param  {number} index The selected index within the stacktrace
   * @return {Promise}
   */
  selectStacktrace (index: number): Promise<void> {
    return this._selectStacktrace(index)
      .then(() => this._getVariables())
      .then(() => this._evaluateWatchExpressions())
  }
  _selectStacktrace (index: number): Promise<void> {
    const session = this._session
    if (!isStarted(this._store) || !session) {
      return Promise.resolve()
    }

    if (this._store.getState().delve.selectedStacktrace === index) {
      // no need to change
      return Promise.resolve()
    }

    return this._updateState(
      () => session.selectStacktrace({ index })
    ).then(() => {
      this._store.dispatch(Actions.selectStacktrace(index))
    })
  }

  /**
   * Selects the given goroutine of the current debugger.
   * @param  {string|number} id The id of the selected goroutine
   * @return {Promise}
   */
  selectGoroutine (id: number): Promise<void> {
    return this._selectGoroutine(id)
      .then(() => this.getStacktrace(id))
      .then(() => this.selectStacktrace(0)) // reselect the first stacktrace entry
  }
  _selectGoroutine (id: number): Promise<void> {
    const session = this._session
    if (!isStarted(this._store) || !session) {
      return Promise.resolve()
    }
    if (this._store.getState().delve.selectedGoroutine === id) {
      // no need to change
      return Promise.resolve()
    }

    return this._updateState(
      () => session.selectGoroutine({ id })
    ).then(() => {
      this._store.dispatch(Actions.selectGoroutine(id))
    })
  }

  getStacktrace (goroutineID: number): Promise<void> {
    const session = this._session
    if (!isStarted(this._store) || !session) {
      return Promise.resolve()
    }

    return this._updateState(
      () => session.getStacktrace({ goroutineID })
    ).then((stacktrace) => {
      this._store.dispatch(Actions.updateStacktrace(stacktrace))
    })
  }

  getGoroutines (): Promise<void> {
    const session = this._session
    if (!isStarted(this._store) || !session) {
      return Promise.resolve()
    }

    return this._updateState(
      () => session.getGoroutines()
    ).then((goroutines) => {
      this._store.dispatch(Actions.updateGoroutines(goroutines))
    })
  }

  _getVariables (): Promise<void> {
    const session = this._session
    if (!isStarted(this._store) || !session) {
      return Promise.resolve()
    }

    const { selectedGoroutine, selectedStacktrace, stacktrace } = this._store.getState().delve

    const st = stacktrace[selectedStacktrace]
    if (!st || st.variables) {
      return Promise.resolve()
    }

    const scope = {
      goroutineID: selectedGoroutine,
      frame: selectedStacktrace
    }
    return this._updateState(
      () => session.getVariables(scope)
    ).then((variables: Variables) => {
      this._store.dispatch(Actions.updateStacktraceVariables(selectedStacktrace, variables))
    })
  }

  evaluate (expr: string): Promise<?Variables> {
    const session = this._session
    if (!isStarted(this._store) || !session) {
      return Promise.resolve(null)
    }

    const { delve } = this._store.getState()
    const { selectedGoroutine: goroutineID, selectedStacktrace: frame } = delve
    return this._updateState(
      () => session.evaluate({ expr, scope: { goroutineID, frame } })
    )
  }

  addWatchExpression (expr: string): Promise<void> {
    const existingExpr = this._store.getState().delve.watchExpressions.find((o) => o.expr === expr)
    if (existingExpr) {
      return Promise.resolve()
    }

    this._store.dispatch(Actions.addWatchExpression(expr))

    if (!isStarted(this._store)) {
      return Promise.resolve()
    }

    return this._evaluateWatchExpression(expr)
  }
  removeWatchExpression (expr: string): Promise<void> {
    this._store.dispatch(Actions.removeWatchExpression(expr))
    return Promise.resolve()
  }
  _evaluateWatchExpression (expr: string): Promise<void> {
    return this._updateState(() => this.evaluate(expr))
      .then((variables: ?Variables) => {
        if (variables) {
          this._store.dispatch(Actions.setWatchExpressionVariables(expr, variables))
        }
      })
  }
  _evaluateWatchExpressions (): Promise<void> {
    const expressions = this._store.getState().delve.watchExpressions
    return Promise.all(
      expressions.map(({ expr }) => this._evaluateWatchExpression(expr))
    ).then(() => {})
  }

  _updateState<T> (fn: () => Promise<T>, before: DebuggerState = 'busy', after: DebuggerState = 'waiting'): Promise<T> {
    // only change the state if we are currently waiting.
    // other states mean that something else is happening
    const changeState = getState(this._store) === 'waiting'
    if (changeState) {
      this._store.dispatch(Actions.setState(before))
    }
    return fn().then((v) => {
      if (changeState) {
        this._store.dispatch(Actions.setState(after))
      }
      return v
    })
  }
}
