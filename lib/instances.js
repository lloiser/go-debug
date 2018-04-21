/* @flow */

import { spawn } from 'child_process'
import rpc from 'json-rpc2'
import { CompositeDisposable, watchPath } from 'atom'
import * as FS from 'fs'
import * as Path from 'path'

import { DelveConfiguration } from './delve-configuration'
import { DelveSession } from './delve-session'
import { DelveConnection } from './delve-connection'
import { Debugger } from './debugger'
import { EditorManager } from './editor-manager'
import { Commands } from './commands'
import { PanelManager } from './panel'
import { saveAllEditors } from './utils'
import * as Actions from './store-actions'

import type { Store } from './store'

export class Instances {
  path: string
  store: Store
  subscriptions: CompositeDisposable
  goconfig: any

  configuration: ?DelveConfiguration
  connection: ?DelveConnection
  dbg: ?Debugger
  editorManager: ?EditorManager
  commands: ?Commands
  panelManager: ?PanelManager

  constructor (path: string, store: Store, goconfig: any) {
    this.path = path
    this.store = store
    this.goconfig = goconfig

    this.subscriptions = new CompositeDisposable()

    // get all
  }

  dispose () {
    this.subscriptions.dispose()
  }

  getConfiguration (): DelveConfiguration {
    let { configuration } = this
    if (!configuration) {
      configuration = new DelveConfiguration(
        this.store,
        (file, callback) => {
          const dir = Path.dirname(file)
          return new Promise((resolve, reject) => {
            FS.stat(dir, (err) => err ? reject(err) : resolve())
          }).then(() => {
            return watchPath(dir, {}, (events) => {
              const eventsForFile = events.filter((event) => event.path === file)
              if (eventsForFile.length) {
                callback(eventsForFile)
              }
            })
          })
        }
      )
      this.subscriptions.add(configuration)
      this.configuration = configuration
    }
    return configuration
  }

  getConnection (): DelveConnection {
    let { connection } = this
    if (!connection) {
      connection = new DelveConnection(
        (args, options) => {
          let promise = Promise.resolve()
          if (atom.config.get('go-debug.saveAllFiles')) {
            // save everything before actually starting delve
            try {
              promise = saveAllEditors()
            } catch (e) {
              this.store.dispatch(
                Actions.addOutputMessage(
                  'Failed to save all files. Error: ' + (e.message || e) + '\n'
                )
              )
            }
          }

          return promise.then(() => {
            this.store.dispatch(Actions.addOutputDelveSpawnOptions(this.path, args, options.cwd, options.env))

            return spawn(this.path, args, options)
          })
        },
        (port, host) => {
          return new Promise((resolve, reject) => {
            rpc.Client.$create(port, host).connectSocket((err, conn) => {
              if (err) {
                return reject(err)
              }
              return resolve(conn)
            })
          })
        },
        (proc, conn, mode) => new DelveSession(proc, conn, mode),
        (message: string) => {
          this.store.dispatch(Actions.addOutputMessage(message))
        },
        this.goconfig
      )
      this.subscriptions.add(connection)
      this.connection = connection
    }
    return connection
  }

  getDebugger (): Debugger {
    let { dbg } = this
    if (!dbg) {
      dbg = new Debugger(this.store, this.getConnection())
      this.subscriptions.add(dbg)
      this.dbg = dbg
    }
    return dbg
  }

  getEditorManager (): EditorManager {
    let { editorManager } = this
    if (!editorManager) {
      editorManager = new EditorManager(this.store, this.getDebugger())
      this.subscriptions.add(editorManager)
      this.editorManager = editorManager
    }
    return editorManager
  }

  getCommands (): Commands {
    let { commands } = this
    if (!commands) {
      commands = new Commands(this.store, this.getDebugger())
      this.subscriptions.add(commands)
      this.commands = commands
    }
    return commands
  }

  getPanelManager (): PanelManager {
    let { panelManager } = this
    if (!panelManager) {
      panelManager = new PanelManager(this.store, this.getDebugger(), this.getCommands())
      this.subscriptions.add(panelManager)
      this.panelManager = panelManager
    }
    return panelManager
  }

  start () {
    this.getConfiguration()
    this.getConnection()
    this.getDebugger()
    this.getEditorManager()
    this.getCommands()
    this.getPanelManager()
  }
}
