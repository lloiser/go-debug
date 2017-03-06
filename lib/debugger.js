'use babel'

import { getBreakpoint, getBreakpoints, getBreakpointByName } from './store-utils'
import { position } from './breakpoint-utils'

export default class Debugger {
  constructor (store, connection, addOutputMessage) {
    this._connection = connection
    this._addOutputMessage = addOutputMessage
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
      this._addOutputMessage('debug', `Please select a configuration in the debugger panel on the right.\n`)
      return Promise.resolve()
    }

    this._store.dispatch({ type: 'SET_STATE', state: 'starting' })

    // clear the output panel
    if (atom.config.get('go-debug.clearOutputOnStart') === true) {
      this._addOutputMessage('clear')
    }

    // start the debugger
    this._addOutputMessage('debug', `Starting delve with config "${config.name}"\n`)

    return this._connection.start({ config, file })
      .then((session) => {
        this._addOutputMessage('debug', `Started delve with config "${config.name}"\n`)
        this._store.dispatch({ type: 'SET_STATE', state: 'started' })

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
        this._addOutputMessage('debug', `Failed to start delve with config "${config.name}"\r\n  Error: ${err}\n`)
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

    const fileAndLine = position(bp)
    this._addOutputMessage('debug', `Adding breakpoint @ ${fileAndLine}\n`)

    return this._addBreakpoint(bp)
      .then(({ id }) => {
        this._addOutputMessage('debug', `Added breakpoint @ ${fileAndLine}\n`)
        this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: { name: bp.name, id, state: 'valid' } })
      })
      .catch((err) => {
        this._addOutputMessage('debug', `Adding breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`)
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

    const fileAndLine = position(bp)
    this._addOutputMessage('debug', `Removing breakpoint @ ${fileAndLine}\n`)

    this._store.dispatch({ type: 'EDIT_BREAKPOINT', bp: { name, state: 'busy' } })

    return this._removeBreakpoint(bp)
      .then(() => this._addOutputMessage('debug', `Removed breakpoint @ ${fileAndLine}\n`))
      .then(done)
      .catch((err) => {
        this._addOutputMessage('debug', `Removing breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`)
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
        const fileAndLine = position(bp)
        this._addOutputMessage('debug', `Updating breakpoint @ ${fileAndLine} failed!\r\n  Error: ${err}\n`)
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

    // clear the existing stacktrace and goroutines if the next delve
    // request takes too long.
    const id = setTimeout(() => {
      this._store.dispatch({ type: 'UPDATE_STACKTRACE', stacktrace: [] })
      this._store.dispatch({ type: 'UPDATE_GOROUTINES', goroutines: [] })
    }, 250)

    return this._busy(
      () => this._session[fn]()
    ).then((newState) => {
      clearTimeout(id)
      if (newState.exited) {
        return this.stop()
      }
      return this.getGoroutines() // get the new goroutines
        .then(() => this.selectGoroutine(newState.goroutineID)) // select the current goroutine
        .then(() => this.selectStacktrace(0)) // reselect the first stacktrace entry
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
    if (this._store.getState().delve.selectedStacktrace === index) {
      // no need to change
      return Promise.resolve()
    }

    return this._busy(
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
    if (!this.isStarted()) {
      return Promise.resolve()
    }
    if (this._store.getState().delve.selectedGoroutine === id) {
      // no need to change
      return this.getStacktrace(id)
    }

    return this._busy(
      () => this._session.selectGoroutine({ id })
    ).then(() => {
      this._store.dispatch({ type: 'SET_SELECTED_GOROUTINE', id })
      return this.getStacktrace(id)
    })
  }

  getStacktrace (goroutineID) {
    if (!this.isStarted()) {
      return Promise.resolve()
    }

    return this._busy(
      () => this._session.getStacktrace({ goroutineID })
    ).then((stacktrace) => {
      this._store.dispatch({ type: 'UPDATE_STACKTRACE', stacktrace })
    })
  }

  getGoroutines () {
    if (!this.isStarted()) {
      return Promise.resolve()
    }

    return this._busy(
      () => this._session.getGoroutines()
    ).then((goroutines) => {
      this._store.dispatch({ type: 'UPDATE_GOROUTINES', goroutines })
    })
  }

  _busy (fn) {
    this._store.dispatch({ type: 'SET_STATE', state: 'busy' })
    return fn().then((v) => {
      this._store.dispatch({ type: 'SET_STATE', state: 'waiting' })
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
    return this.getState() === 'busy'
  }

  getState () {
    return this._store.getState().delve.state
  }
}
