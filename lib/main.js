'use babel'

import { CompositeDisposable, watchPath } from 'atom'
import * as FS from 'fs'
import * as Path from 'path'

import { serialize } from './store-utils'
import { saveAllEditors } from './utils'

let isStarted, dependenciesInstalled
let subscriptions, initialState, path
let goconfig, goget
let store, outputPanelManager

export default {
  activate (state) {
    isStarted = false
    dependenciesInstalled = false

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
    isStarted = false
  },
  serialize () {
    return store ? serialize(store) : initialState
  },

  provideGoPlusView () {
    return {
      view: require('./output-panel'),
      model: this.getOutputPanelManager()
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
      console.error('go-debug', 'Failed to get "dlv"', e)
      const message = (e && e.message) || e || 'An unknown error occured'
      this.getStore().dispatch({ type: 'ADD_OUTPUT_CONTENT', content: { type: 'message', message: message + '\n' } })
    })
  },
  getOutputPanelManager () {
    if (!outputPanelManager) {
      const OutputPanelManager = require('./output-panel-manager')
      outputPanelManager = new OutputPanelManager()
    }
    return outputPanelManager
  },
  getStore () {
    if (!store) {
      const Store = require('./store')
      store = Store(initialState)
    }
    return store
  },

  start () {
    if (!path || isStarted || !dependenciesInstalled) {
      return
    }
    isStarted = true

    // load all dependencies once after everything is ready
    // this reduces the initial load time of this package
    this.getStore()

    const DelveConfiguration = require('./delve-configuration')
    const configuration = new DelveConfiguration(
      store,
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

    const DelveSession = require('./delve-session')
    const { spawn } = require('child_process')
    const rpc = require('json-rpc2')

    const DelveConnection = require('./delve-connection')
    const connection = new DelveConnection(
      (args, options) => {
        let promise = Promise.resolve()
        if (atom.config.get('go-debug.saveAllFiles')) {
          // save everything before actually starting delve
          try {
            promise = saveAllEditors()
          } catch (e) {
            store.dispatch({
              type: 'ADD_OUTPUT_CONTENT',
              content: {
                type: 'message',
                message: 'Failed to save all files. Error: ' + (e.message || e) + '\n'
              }
            })
          }
        }

        return promise.then(() => {
          store.dispatch({
            type: 'ADD_OUTPUT_CONTENT',
            content: { type: 'dlvSpawnOptions', path, args, cwd: options.cwd, env: options.env }
          })

          return spawn(path, args, options)
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
      (message) => {
        store.dispatch({
          type: 'ADD_OUTPUT_CONTENT',
          content: { type: 'message', message }
        })
      },
      goconfig
    )

    const Debugger = require('./debugger')
    const dbg = new Debugger(
      store,
      connection
    )

    this.getOutputPanelManager().setStoreAndDbg(store, dbg)

    const EditorManager = require('./editor-manager')
    const editorManager = new EditorManager(store, dbg)

    const Commands = require('./commands')
    const commands = new Commands(store, dbg)

    const { PanelManager } = require('./panel')
    const panelManager = new PanelManager(store, dbg, commands)

    subscriptions.add(
      dbg,
      editorManager,
      panelManager,
      commands,
      connection,
      configuration
    )
  }
}
