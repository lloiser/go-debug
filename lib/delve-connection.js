/* @flow */

import * as path from 'path'
import * as fs from 'fs'

import type { Configuration } from './debugger-flow-types'
import type { DelveSession } from './delve-session'
import type { ChildProcess } from 'child_process'

export type RPCConnection = {|
  end: () => void,
  call: (method: string, args: mixed[], callback: (err: Error, response: any) => void) => void
|}

declare type Spawn = (args: string[], options: Object) => Promise<ChildProcess>
declare type Connect = (port: number, host: string) => Promise<RPCConnection>
declare type NewSession = (proc: ChildProcess, conn: RPCConnection, mode: string) => DelveSession
declare type AddOutputMessage = (msg: string) => void
declare type GoConfig = { environment: () => { [key: string]: string} }

export class DelveConnection {
  _spawn: Spawn
  _connect: Connect
  _newSession: NewSession
  _addOutputMessage: AddOutputMessage
  _goconfig: GoConfig
  _session: ?DelveSession

  constructor (spawn: Spawn, connect: Connect, newSession: NewSession, addOutputMessage: AddOutputMessage, goconfig: GoConfig) {
    this._spawn = spawn
    this._connect = connect
    this._newSession = newSession
    this._addOutputMessage = addOutputMessage
    this._goconfig = goconfig
    this._session = null
  }

  start (o: { config: Configuration, file: ?string }): Promise<DelveSession> {
    const { config, file } = o
    if (this._session) {
      return Promise.reject(new Error('Already debugging!'))
    }

    return new Promise((resolve, reject) => {
      const { mode } = config
      const { host, port } = hostAndPort(config)

      let client
      let proc
      let canceled = false

      const connect = () => {
        if (client) {
          return
        }
        client = 'creating ...'

        // add a slight delay so that issues of delve while starting will
        // exit delve and therefore cancel the debug session
        setTimeout(() => {
          if (canceled) {
            return
          }
          this._connect(port, host)
            .then((conn) => {
              this._session = this._newSession(proc, conn, mode)
              resolve(this._session)
            })
            .catch(reject)
        }, 250)
      }

      const prepare = () => {
        const variables = getVariables(file)
        updateEnv(config, variables, this._goconfig)
        const cwd = getCwd(config, variables)

        return getDlvArgs(config, variables).then((dlvArgs) => {
          return {
            dlvArgs,
            cwd,
            env: variables.env
          }
        })
      }

      const spawn = ({ dlvArgs, cwd, env }) => {
        return this._spawn(dlvArgs, { cwd, env })
      }

      const io = (dlvProc) => {
        proc = dlvProc

        proc.stderr.on('data', (chunk) => {
          this._addOutputMessage('Delve output: ' + chunk.toString())
          connect()
        })
        proc.stdout.on('data', (chunk) => {
          this._addOutputMessage(chunk.toString())
          connect()
        })

        const close = () => {
          proc.kill()
          this.dispose()
          canceled = true
        }

        proc.on('close', (code) => {
          this._addOutputMessage('delve closed with code ' + (code || 0) + '\n')
          close()
          if (code) {
            reject(new Error('Closed with code ' + code))
          }
        })
        proc.on('error', (err) => {
          this._addOutputMessage('error: ' + (err || '') + '\n')
          close()
          reject(err)
        })
      }

      if (mode === 'remote') {
        // delve is already running on a remote machine.
        // just connect to it using the host and port.
        connect()
        return
      }

      prepare().then(spawn).then(io)
    })
  }

  dispose (): Promise<void> {
    const session = this._session
    if (session) {
      this._session = null
      return session.stop(false)
    }
    return Promise.resolve()
  }
}

const regexVariable = /\${(.*?)}/g

function replaceVariable (value, variables) {
  return (value || '').replace(regexVariable, (group, name) => {
    if (name.startsWith('env.')) {
      return variables.env[name.replace('env.', '')]
    }
    return variables[name]
  })
}

function getVariables (file) {
  const workspaceFile = file != null && atom.project.relativizePath(file)
  return {
    // the working directory on startup of atom
    cwd: process.cwd(),
    // the open file (full path)
    file,
    // the open file's basename
    fileBasename: file != null && file !== '' && path.basename(file),
    // the open file's dirname
    fileDirname: file != null && file !== '' && path.dirname(file),
    // the open file's extension
    fileExtname: file != null && file !== '' && path.extname(file),
    // the open file relative to the "workspaceRoot" variable
    relativeFile: workspaceFile && workspaceFile[1],
    // the full path of the project root folder
    workspaceRoot: workspaceFile && workspaceFile[0],
    env: {}
  }
}

function updateEnv (config, variables, goconfig) {
  // already assign the already known environment variables here so they can be used by the `config.env` values
  variables.env = goconfig.environment()

  const env = Object.assign({}, variables.env)
  const configEnv = config.env
  if (configEnv) {
    for (const key in configEnv) {
      if (configEnv.hasOwnProperty(key)) {
        env[key] = replaceVariable(configEnv[key], variables)
      }
    }
  }
  variables.env = env
}

const SERVER_URL = 'localhost'
const SERVER_PORT = 2345

function hostAndPort (config) {
  const { host = SERVER_URL, port = SERVER_PORT } = config
  return { host, port }
}

function getDlvArgs (config, variables) {
  const { mode, program, showLog = false, buildFlags = '', init: dlvInit = '', args } = config
  const { host, port } = hostAndPort(config)
  const dlvArgs = [mode || 'debug']

  let prom = Promise.resolve()
  if (mode === 'attach') {
    prom = attach().then((processID) => {
      dlvArgs.push(processID)
    })
  }

  return prom.then(() => {
    if (mode === 'exec') {
      // debug a pre compiled executable
      dlvArgs.push(replaceVariable(program, variables))
    }
    dlvArgs.push(
      '--headless=true',
      `--listen=${host}:${port}`,
      '--api-version=2'
    )
    if (showLog) {
      // turn additional delve logging on or off
      dlvArgs.push('--log=' + showLog.toString())
    }
    if (buildFlags) {
      // add additional build flags to delve
      dlvArgs.push('--build-flags=' + buildFlags)
    }
    if (dlvInit) {
      // used to execute some commands when delve starts
      dlvArgs.push('--init=' + replaceVariable(dlvInit, variables))
    }
    if (args) {
      dlvArgs.push('--', ...args.map((v) => replaceVariable(v, variables)))
    }

    return dlvArgs
  })
}

function attach () {
  return new Promise((resolve, reject) => {
    const item = document.createElement('div')
    item.innerHTML = '<p>Process ID:</p>' +
      '<input type="text" class="go-debug-attach-input native-key-bindings" />' +
      '<button type="button" class="go-debug-attach-btn btn">OK</button>'

    const panel = atom.workspace.addModalPanel({ item })

    const input: HTMLInputElement = (item.querySelector('.go-debug-attach-input'): any)
    input.focus()

    const btn: HTMLButtonElement = (item.querySelector('.go-debug-attach-btn'): any)
    btn.addEventListener('click', () => {
      panel.destroy()
      const { value } = input
      if (value) {
        resolve(value)
      }
    })
  })
}

function getCwd (config, variables) {
  let { cwd = '' } = config
  if (cwd) {
    return replaceVariable(cwd, variables)
  }
  let file = variables.file
  try {
    if (file != null && file !== '' && fs.lstatSync(file).isDirectory()) {
      cwd = file // assume it is a package...
    }
  } catch (e) {
    // ...
  }
  if (!cwd && file != null && file !== '') {
    cwd = path.dirname(file)
  }
  if (!cwd) {
    cwd = atom.project.getPaths()[0]
  }
  return cwd
}
