'use babel'

import * as DelveVariables from './delve-variables'

const RPC_ENDPOINT = 'RPCServer.'

export default class DelveSession {
  constructor (process, connection, mode) {
    this._process = process
    this._connection = connection
    this._mode = mode
    this.addOutputMessage = console.log.bind(console)
  }

  stop () {
    if (!this._connection || this._stopPromise) {
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
      prom = this._call('Detach', { kill: true })
    }

    const timeoutProm = new Promise((resolve, reject) => {
      id = setTimeout(resolve, 1000)
    })

    this._stopPromise = Promise.race([
      prom,
      timeoutProm
    ]).then(kill).catch(kill)
    return this._stopPromise
  }

  addBreakpoint ({ file, line }) {
    // note: delve = 1 indexed line numbers / atom = 0 indexed line numbers
    const p = this._call('CreateBreakpoint', { breakpoint: { file, line: line + 1 } })

    return p.then(({ Breakpoint }) => {
      return { id: Breakpoint.id }
    })
  }

  removeBreakpoint ({ id }) {
    return this._call('ClearBreakpoint', { id })
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

   // _command executes the given command (like continue, step, next, ...)
  _command (name) {
    return this._call('Command', { name }).then(({ State }) => {
      const exited = !!State.exited
      return {
        exited: exited,
        goroutineID: exited ? -1 : State.currentGoroutine.id
      }
    })
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
    const args = {
      id: goroutineID,
      depth: 20,
      full: true
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
        func: stack.function.name.split('/').pop(),
        variables: DelveVariables.create(stack.Locals.concat(stack.Arguments))
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
    return goroutines.map(({ id, userCurrentLoc }) => {
      return {
        id,
        file: userCurrentLoc.file,
        line: userCurrentLoc.line - 1, // dlv = 1 indexed line / atom = 0 indexed line
        func: userCurrentLoc.function.name.split('/').pop()
      }
    })
  }

  // call is the base method for all calls to delve
  _call (method, ...args) {
    return new Promise((resolve, reject) => {
      const endpoint = RPC_ENDPOINT + method
      this._connection.call(endpoint, args, (err, result) => {
        if (err) {
          this.addOutputMessage('debug', `Failed to call ${method}!\r\n  Error: ${err}\n`)
          reject(err)
          return
        }
        resolve(result)
      })
    })
  }
}
