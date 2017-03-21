'use babel'

import { CompositeDisposable } from 'atom'

import * as OutputPanelManager from './output-panel-manager'
import { serialize } from './store-utils'

let subscriptions
let goconfig, goget, path
let dependenciesInstalled = false
let store, initialState

export default {
  activate (state) {
    subscriptions = new CompositeDisposable()

    require('atom-package-deps').install('go-debug').then(() => {
      dependenciesInstalled = true
      this.start()
      return true
    }).catch((e) => {
      console.warn('go-debug', e)
    })

    initialState = state
  },
  deactivate () {
    subscriptions.dispose()
    subscriptions = null
    store = null
    goget = null
    goconfig = null
    path = null
  },
  serialize () {
    return store ? serialize(store) : initialState
  },

  provideGoPlusView () {
    return {
      view: require('./output-panel'),
      model: OutputPanelManager.getManager()
    }
  },
  consumeGoget (service) {
    goget = service
    this.getDlv()
  },
  consumeGoconfig (service) {
    goconfig = service
    this.getDlv()
  },
  getDlv () {
    if (!goget || !goconfig) {
      return
    }

    const getDelve = require('./delve-get')
    getDelve(goget, goconfig).then((p) => {
      path = p
      this.start()
    }).catch((e) => {
      OutputPanelManager.addOutputMessage('package', e.message)
    })
  },

  start () {
    if (!path || store || !dependenciesInstalled) {
      return
    }

    // load all dependencies once after everything is ready
    // this reduces the initial load time of this package
    const Store = require('./store')
    store = Store(initialState)

    const chokidar = require('chokidar')
    const DelveConfiguration = require('./delve-configuration')
    const configuration = new DelveConfiguration(
      store,
      (file, callback) => chokidar.watch(file).on('all', (event) => callback(event))
    )

    const DelveSession = require('./delve-session')
    const { spawn } = require('child_process')
    const rpc = require('json-rpc2')

    const DelveConnection = require('./delve-connection')
    const connection = new DelveConnection(
      (args, options) => {
        if (atom.config.get('go-debug.saveAllFiles')) {
          // save everything before actually starting delve
          try {
            atom.workspace.saveAll()
          } catch (e) {
            OutputPanelManager.addOutputMessage('package', 'Failed to save all files. Error: ' + (e.message || e))
          }
        }
        return spawn(path, args, options)
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
      OutputPanelManager.addOutputMessage,
      goconfig
    )

    const Debugger = require('./debugger')
    const dbg = new Debugger(
      store,
      connection,
      OutputPanelManager.addOutputMessage,
    )

    const EditorManager = require('./editor-manager')
    const editorManager = new EditorManager(store, dbg)

    const Commands = require('./commands')
    const commands = new Commands(store, dbg)

    const { PanelManager } = require('./panel')
    const panelManager = new PanelManager(store, dbg, commands)

    subscriptions = new CompositeDisposable(
      dbg,
      editorManager,
      panelManager,
      commands,
      connection,
      configuration
    )
  }
}
