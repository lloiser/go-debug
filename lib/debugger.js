'use babel'

import { getBreakpoint, getBreakpoints, getBreakpointByName } from './store-utils'
import { location } from './utils'

export default class Debugger {
  constructor (store, connection) {
    this._connection = connection
    this._store = store
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
  start (config, file) {
    if (this.isStarted()) {
      return Promise.resolve()
    }

    if (!config) {
      this._addOutputMessage(`Please select a configuration in the debugger panel on the right.\n`)
      return Promise.resolve()
    }

    this._store.dispatch({ type: 'SET_STATE', state: 'starting' })

    // clear the output panel
    if (atom.config.get('go-debug.clearOutputOnStart') === true) {
      this._store.dispatch({ type: 'CLEAR_OUTPUT_CONTENT' })
    }

    // start the debugger
    this._addOutputMessage(`Starting delve with config "${config.name}"\n`)

    return this._connection.start({ config, file })
      .then((session) => {
        this._addOutputMessage(`Started delve with config "${config.name}"\n`)
        this._store.dispatch({ type: 'SET_STATE', state: 'waiting' })

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
        this._addOutputMessage(`Failed to start delve with config "${config.name}"\r\n  Error: ${err}\n`)
        return this.stop()
      })
  }

  /**
   * Stops a debugging session.
   * @return {Promise}
   */
  stop () {
    if (!this.isStarted()) {
      return Promise.resolve()
    }
    if (!this._session) {
      return Promise.resolve()
    }
    if (!this._stopPromise) {
      // the debugger is currently running the program
      // so halt it before we can stop it
      const requiresHalt = this.isBusy()
      this._stopPromise = this._session.stop(requiresHalt)
        .then(() => {
          this._stopPromise = null
          this._session = null
          this._store.dispatch({ type: 'STOP' })
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
  addBreakpoint (file, line) {
    if (!this.isStarted()) {
      this._store.dispatch({ type: 'ADD_BREAKPOINT', bp: { file, line, state: 'notStarted' } })
      return Promise.resolve()
    }

    let bp = getBreakpoint(this._store, file, line)
    if (bp && bp.state === 'busy') {
      // already being added
      return Promise.resolve()
    }

    if (!bp) {
      this._store.dispatch({ type: 'ADD_BREAKPOINT', bp: { file, line, state: 'busy' } })
    } else {
      this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: { name: bp.name, state: 'busy' } })
    }
    bp = getBreakpoint(this._store, file, line)

    const fileAndLine = location(bp)

    return this._addBreakpoint(bp)
      .then(({ id }) => {
        this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: { name: bp.name, id, state: 'valid' } })
      })
      .catch((err) => {
        this._addOutputMessage(`Adding breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`)
        this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: { name: bp.name, state: 'error', message: err } })
      })
  }
  _addBreakpoint (bp) {
    return this._session.addBreakpoint({ bp })
  }

  /**
   * Removes a breakpoint
   * @param {string} name
   * @return {Promise}
   */
  removeBreakpoint (name) {
    const bp = getBreakpointByName(this._store, name)
    if (!bp) {
      return Promise.resolve()
    }

    const done = () => {
      this._store.dispatch({ type: 'REMOVE_BREAKPOINT', bp: { name } })
    }

    if (bp.state === 'error' || !this.isStarted()) {
      return Promise.resolve().then(done)
    }

    const fileAndLine = location(bp)

    this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: { name, state: 'busy' } })

    return this._removeBreakpoint(bp)
      .then(done)
      .catch((err) => {
        this._addOutputMessage(`Removing breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`)
        this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: { name, state: 'error', message: err } })
      })
  }
  _removeBreakpoint (bp) {
    return this._session.removeBreakpoint({ id: bp.id })
  }

  /**
   * Adds or removes a breakpoint for the given file and line.
   * @param {string} file
   * @param {number} line
   * @return {Promise}
   */
  toggleBreakpoint (file, line) {
    const bp = getBreakpoint(this._store, file, line)
    if (!bp) {
      return this.addBreakpoint(file, line)
    }
    return this.removeBreakpoint(bp.name)
  }

  editBreakpoint (name, changes) {
    const bp = getBreakpointByName(this._store, name)
    if (!bp) {
      return Promise.resolve()
    }

    const newBP = Object.assign({}, bp, changes)

    const done = (bp) => {
      this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp })
    }
    if (!this.isStarted()) {
      // apply the changes immediately
      done(newBP)
      return Promise.resolve()
    }

    if (!bp.id) {
      return this.addBreakpoint(bp.file, bp.line)
    }

    this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: Object.assign({}, newBP, { state: 'busy' }) })
    return this._session.editBreakpoint({ bp: newBP })
      .then(() => {
        done(Object.assign({}, newBP, { state: 'valid' }))
      })
      .catch((err) => {
        const fileAndLine = location(bp)
        this._addOutputMessage(`Updating breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`)
        this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: { name: bp.name, state: 'error', message: err } })
      })
  }

  /**
   * Resumes the current debugger.
   * @return {Promise}
   */
  resume () {
    return this.continueExecution('resume')
  }

  /**
   * Halts the current debugger.
   * @return {Promise}
   */
  halt () {
    return this.continueExecution('halt')
  }

  /**
   * Step the current debugger to the next line.
   * @return {Promise}
   */
  next () {
    return this.continueExecution('next')
  }

  /**
   * Step the current debugger into the current function/instruction.
   * @return {Promise}
   */
  stepIn () {
    return this.continueExecution('stepIn')
  }

  /**
   * Step the current debugger out of the current function/instruction.
   * @return {Promise}
   */
  stepOut () {
    return this.continueExecution('stepOut')
  }

  continueExecution (fn) {
    if (!this.isStarted()) {
      return Promise.resolve()
    }

    if (fn !== 'halt' && this.isBusy()) {
      return Promise.resolve()
    }

    // clear the existing stacktrace and goroutines if the next delve
    // request takes too long.
    const id = setTimeout(() => {
      this._store.dispatch({ type: 'UPDATE_STACKTRACE', stacktrace: [] })
      this._store.dispatch({ type: 'UPDATE_GOROUTINES', goroutines: [] })
    }, 500)

    return this._updateState(
      () => this._session[fn]().catch((err) => {
        this._addOutputMessage(`Failed to ${fn}!\r\n  Error: ${err}\n`)
        return null
      }),
      'running'
    ).then((newState) => {
      clearTimeout(id)
      if (!newState) {
        return
      }
      if (newState.error) {
        this._addOutputMessage(`Failed to ${fn}!\r\n  Error: ${newState.error}\n`)
      }
      if (newState.exited) {
        return this.stop()
      }
      return this.getGoroutines() // get the new goroutines
        .then(() => this.selectGoroutine(newState.goroutineID)) // select the current goroutine
    })
  }

  /**
   * Restarts the current debugger.
   * @return {Promise}
   */
  restart () {
    if (!this.isStarted()) {
      return Promise.resolve()
    }
    return this._session.restart().then(() => {
      this._store.dispatch({ type: 'RESTART' })
      // immediately start the execution (like "start" does)
      this.resume()
    })
  }

  /**
   * Selects the given stacktrace of the current debugger.
   * @param  {number} index The selected index within the stacktrace
   * @return {Promise}
   */
  selectStacktrace (index) {
    return this._selectStacktrace(index)
      .then(() => this._getVariables())
      .then(() => this._evaluateWatchExpressions())
  }
  _selectStacktrace (index) {
    if (this._store.getState().delve.selectedStacktrace === index) {
      // no need to change
      return Promise.resolve()
    }

    return this._updateState(
      () => this._session.selectStacktrace({ index })
    ).then(() => {
      this._store.dispatch({ type: 'SET_SELECTED_STACKTRACE', index })
    })
  }

  /**
   * Selects the given goroutine of the current debugger.
   * @param  {string|number} id The id of the selected goroutine
   * @return {Promise}
   */
  selectGoroutine (id) {
    return this._selectGoroutine(id)
      .then(() => this.getStacktrace(id))
      .then(() => this.selectStacktrace(0)) // reselect the first stacktrace entry
  }
  _selectGoroutine (id) {
    if (!this.isStarted()) {
      return Promise.resolve()
    }
    if (this._store.getState().delve.selectedGoroutine === id) {
      // no need to change
      return Promise.resolve()
    }

    return this._updateState(
      () => this._session.selectGoroutine({ id })
    ).then(() => {
      this._store.dispatch({ type: 'SET_SELECTED_GOROUTINE', id })
    })
  }

  getStacktrace (goroutineID) {
    if (!this.isStarted()) {
      return Promise.resolve()
    }

    return this._updateState(
      () => this._session.getStacktrace({ goroutineID })
    ).then((stacktrace) => {
      this._store.dispatch({ type: 'UPDATE_STACKTRACE', stacktrace })
    })
  }

  getGoroutines () {
    if (!this.isStarted()) {
      return Promise.resolve()
    }

    return this._updateState(
      () => this._session.getGoroutines()
    ).then((goroutines) => {
      this._store.dispatch({ type: 'UPDATE_GOROUTINES', goroutines })
    })
  }

  _getVariables () {
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
      () => this._session.getVariables(scope)
    ).then((variables) => {
      this._store.dispatch({ type: 'UPDATE_VARIABLES', variables, stacktraceIndex: selectedStacktrace })
    })
  }

  evaluate (expr) {
    if (!this.isStarted()) {
      return Promise.resolve()
    }

    const { delve } = this._store.getState()
    const { selectedGoroutine: goroutineID, selectedStacktrace: frame } = delve
    return this._updateState(
      () => this._session.evaluate({ expr, scope: { goroutineID, frame } })
    )
  }

  addWatchExpression (expr) {
    const existingExpr = this._store.getState().delve.watchExpressions.find((o) => o.expr === expr)
    if (existingExpr) {
      return Promise.resolve()
    }

    this._store.dispatch({ type: 'ADD_WATCH_EXPRESSION', expr })

    if (!this.isStarted()) {
      return Promise.resolve()
    }

    return this._evaluateWatchExpression(expr)
  }
  removeWatchExpression (expr) {
    this._store.dispatch({ type: 'REMOVE_WATCH_EXPRESSION', expr })
    return Promise.resolve()
  }
  _evaluateWatchExpression (expr) {
    return this._updateState(() => this.evaluate(expr))
      .then((variables) => {
        this._store.dispatch({ type: 'SET_WATCH_EXPRESSION_VARIABLES', expr, variables })
      })
  }
  _evaluateWatchExpressions () {
    const expressions = this._store.getState().delve.watchExpressions
    return Promise.all(
      expressions.map(({ expr }) => this._evaluateWatchExpression(expr))
    )
  }

  _updateState (fn, before = 'busy', after = 'waiting') {
    // only change the state if we are currently waiting.
    // other states mean that something else is happening
    const changeState = this.getState() === 'waiting'
    if (changeState) {
      this._store.dispatch({ type: 'SET_STATE', state: before })
    }
    return fn().then((v) => {
      if (changeState) {
        this._store.dispatch({ type: 'SET_STATE', state: after })
      }
      return v
    })
  }

  /**
   * Loads the variables for the given path.
   * @param  {string} path     The path of the variable to load
   * @param  {object} variable The variable
   * @return {Promise}
   */
  loadVariable (path, variable) {
    this._store.dispatch({ type: 'SET_STATE', state: 'busy' })
    return this._session.loadVariable({ path, variable }).then((variables) => {
      this._store.dispatch({
        type: 'UPDATE_VARIABLES',
        // updating variable at this path ...
        path,
        // ... resulted in the following variables
        variables,
        // add it to current selected stacktrace entry
        stacktraceIndex: this._store.getState().delve.selectedStacktrace,
        state: 'waiting'
      })
    })
  }

  /**
   * Returns `true` if the given debugger is started, `false` otherwise.
   * @return {boolean}
   */
  isStarted () {
    const state = this.getState()
    return state !== 'notStarted' && state !== 'starting'
  }

  isBusy () {
    const state = this.getState()
    return state === 'busy' || state === 'running'
  }

  getState () {
    return this._store.getState().delve.state
  }

  _addOutputMessage (message) {
    this._store.dispatch({
      type: 'ADD_OUTPUT_CONTENT',
      content: {
        type: 'message',
        message
      }
    })
  }
}
