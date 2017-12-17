/* @flow */

import { CompositeDisposable } from 'atom'

import { serialize } from './store-utils'

import type { Store } from './store'
import type { SerializedState } from './debugger-flow-types'
import type { OutputPanelManager } from './output-panel-manager'
import type { Instances } from './instances'

let subscriptions
let isStarted: boolean = false
let dependenciesInstalled
let initialState: ?SerializedState

let goconfig
let goget

let store: ?Store
let outputPanelManager: ?OutputPanelManager
let path: string = ''
let actions
let instances: ?Instances

export default {
  activate (state: ?SerializedState) {
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
    if (subscriptions) {
      subscriptions.dispose()
    }
    subscriptions = null
    store = null
    instances = null
    actions = null
    goget = null
    goconfig = null
    path = ''
    isStarted = false
  },
  serialize () {
    return store ? serialize(store) : initialState
  },

  provideGoPlusView () {
    return {
      view: require('./output-panel').OutputPanel,
      model: this.getOutputPanelManager()
    }
  },
  consumeGoget (service: any) {
    goget = service
    this.getDlv()
  },
  consumeGoconfig (service: any) {
    goconfig = service
    this.getDlv()
  },
  getDlv () {
    if (!goget || !goconfig) {
      return
    }

    const { getDelve } = require('./delve-get')
    getDelve(goget, goconfig).then((p) => {
      path = p
      this.start()
    }).catch((e) => {
      console.error('go-debug', 'Failed to get "dlv"', e)
      const message = (e && e.message) || e || 'An unknown error occured'
      this.getStore().dispatch(this.getStoreActions().addOutputMessage(message + '\n'))
    })
  },
  getOutputPanelManager (): OutputPanelManager {
    if (!outputPanelManager) {
      const { OutputPanelManager } = require('./output-panel-manager')
      outputPanelManager = new OutputPanelManager(this.getStore(), (value: string) => {
        return this.getInstances().getDebugger().evaluate(value)
      })
    }
    return outputPanelManager
  },
  getStore (): Store {
    if (!store) {
      const { createStore } = require('./store')
      store = createStore(initialState)
    }
    return store
  },
  getStoreActions () {
    if (!actions) {
      actions = require('./store-actions')
    }
    return actions
  },
  getInstances (): Instances {
    if (!instances) {
      const { Instances } = require('./instances')
      instances = new Instances(path, this.getStore(), goconfig)
      subscriptions && subscriptions.add(instances)
    }
    return instances
  },

  start () {
    if (path === '' || isStarted || !dependenciesInstalled) {
      return
    }
    isStarted = true

    // load all dependencies once after everything is ready
    // this reduces the initial load time of this package
    const insts = this.getInstances()
    insts.start()
  }
}
