'use babel'

import * as DelveVariables from './delve-variables'

const RPC_ENDPOINT = 'RPCServer.'
const breakpointProps = ['id', 'name', 'file', 'line', 'cond']

// note: mimic the "full" flag in the "Stacktrace" call
const defaultVariableCfg = {
  followPointers: true,
  maxVariableRecurse: 1,
  maxStringLen: 64,
  maxArrayValues: 64,
  maxStructFields: -1
}

const VariableShadowed = 2

export default class DelveSession {
  constructor (process, connection, mode) {
    this._process = process
    this._connection = connection
    this._mode = mode
  }

  stop (requiresHalt) {
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
      this._connection = null
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

  addBreakpoint ({ bp }) {
    // only keep those props that delve knows
    const breakpoint = breakpointProps.reduce((o, prop) => {
      o[prop] = bp[prop]
      if (prop === 'line') {
        o.line++ // note: delve = 1 indexed line numbers / atom = 0 indexed line numbers
      }
      return o
    }, {})

    return this._call('CreateBreakpoint', { breakpoint }).then(({ Breakpoint }) => {
      return { id: Breakpoint.id }
    })
  }

  removeBreakpoint ({ id }) {
    return this._call('ClearBreakpoint', { id })
  }

  editBreakpoint ({ bp }) {
    return this._call('AmendBreakpoint', { breakpoint: bp })
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
  halt (stopping) {
    return this._command('halt')
  }

   // _command executes the given command (like continue, step, next, ...)
  _command (name) {
    return this._call('Command', { name }).then(({ State }) => {
      // stopping a running program which is not halted at the moment
      // (so waiting for further debug commands like 'continue' or 'step')
      // ends up here too, so simply return that it already has stopped
      return this._stateToDebuggerState(State)
    }).catch((err) => {
      return this.getState().then(state => {
        state.error = err
        return state
      })
    })
  }
  getState () {
    return this._call('State', {}).then(({ State }) => {
      return this._stateToDebuggerState(State)
    })
  }
  _stateToDebuggerState (state, error) {
    const exited = this._stopPromise ? true : !!state.exited
    let goroutineID = -1
    if (!exited) {
      goroutineID = (state.currentGoroutine && state.currentGoroutine.id) || -1
      if (goroutineID === -1) {
        goroutineID = (state.currentThread && state.currentThread.goroutineID) || -1
      }
    }
    return {
      exited,
      goroutineID
    }
  }

   // restart the delve session
  restart () {
    return this._call('Restart')
  }

  selectStacktrace ({ index }) {
    void index // nothing special to do here ...
    return Promise.resolve()
  }
  getStacktrace ({ goroutineID }) {
    if (goroutineID === -1) {
      return Promise.resolve([])
    }

    const args = {
      id: goroutineID,
      depth: 20
    }
    return this._call('Stacktrace', args)
      .then(this._prepareStacktrace.bind(this))
  }
  _prepareStacktrace ({ Locations: stacktrace }) {
    return stacktrace.map((stack) => {
      return {
        id: stack.pc,
        file: stack.file,
        line: stack.line - 1, // delve = 1 indexed line / atom = 0 indexed line
        func: stack.function.name.split('/').pop()
      }
    })
  }

  selectGoroutine ({ id }) {
    return this._call('Command', { name: 'switchGoroutine', goroutineID: id })
  }
  getGoroutines () {
    return this._call('ListGoroutines')
      .then(this._prepareGoroutines.bind(this))
  }
  _prepareGoroutines ({ Goroutines: goroutines }) {
    return goroutines.map(({ id, userCurrentLoc, goStatementLoc }) => {
      const loc = userCurrentLoc.file ? userCurrentLoc : goStatementLoc
      return {
        id,
        file: loc.file,
        line: loc.line - 1, // dlv = 1 indexed line / atom = 0 indexed line
        func: loc.function.name.split('/').pop()
      }
    })
  }

  getVariables (scope, cfg = defaultVariableCfg) {
    return Promise.all([
      this._getLocalVariables(scope, cfg),
      this._getFunctionArguments(scope, cfg)
    ]).then(([locals, args]) => {
      // note: workaround for github.com/derekparker/delve/issues/951
      // check the args if they contain variables that also exist in
      // the local variables. if so mark them as shadowed (flag & 2)
      args.forEach((arg) => {
        if (locals.find((local) => local.name === arg.name)) {
          arg.flag |= 2
        }
      })
      const vars = locals.concat(args)
        // variable is shadowed by another one, skip it
        .filter((v) => ((v.flag & VariableShadowed) === 0)
      )
      return DelveVariables.create(vars)
    })
  }
  _getLocalVariables (scope, cfg) {
    return this._call('ListLocalVars', { scope, cfg }).then((o) => o.Variables)
  }
  _getFunctionArguments (scope, cfg) {
    return this._call('ListFunctionArgs', { scope, cfg }).then((o) => o.Args)
  }

  evaluate ({ expr, scope }) {
    return this._call('Eval', { expr, scope })
      .then((result) => {
        return DelveVariables.create([result.Variable])
      })
      .catch((err) => {
        return DelveVariables.createError(err, expr)
      })
  }

  // call is the base method for all calls to delve
  _call (method, ...args) {
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
