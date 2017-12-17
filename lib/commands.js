/* @flow */

import { CompositeDisposable } from 'atom'
import { getEditor, elementPropInHierarcy } from './utils'
import { editBreakpointCondition } from './breakpoint-condition'
import { getBreakpointByName } from './store-utils'

import type { Store } from './store'
import type { Debugger } from './debugger'

function currentFile () {
  const editor = getEditor()
  return editor && editor.getPath()
}

function currentLine () {
  const editor = getEditor()
  return editor && editor.getCursorBufferPosition().row
}

const commands = {
  'start': (store, dbg) => {
    const { selectedConfig, configurations } = store.getState()
    let config
    if (selectedConfig) {
      config = configurations.reduce(
        (v, c) => (c && c.configs.find(({ name }) => name === selectedConfig)) || v,
        null
      )
    }
    if (!config) {
      return
    }
    dbg.start(config, currentFile())
  },
  'resume': (store, dbg) => dbg.resume(),
  'halt': (store, dbg) => dbg.halt(),
  'next': (store, dbg) => dbg.next(),
  'stepIn': (store, dbg) => dbg.stepIn(),
  'stepOut': (store, dbg) => dbg.stepOut(),
  'restart': (store, dbg) => dbg.restart(),
  'stop': (store, dbg) => dbg.stop(),
  'toggle-breakpoint': (store, dbg) => {
    const file = currentFile()
    if (file == null) {
      return
    }
    dbg.toggleBreakpoint(file, currentLine())
  }
}

export class Commands {
  _store: Store
  _dbg: Debugger

  _keyboardCommands: { [name: string]: atom$CommandListener }
  _subscriptions: CompositeDisposable
  _keyboardSubscription: ?IDisposable

  onExecute: (key: string) => void

  constructor (store: Store, dbg: Debugger) {
    this._store = store
    this._dbg = dbg

    this._keyboardCommands = {}
    Object.keys(commands).forEach((cmd) => { this._keyboardCommands['go-debug:' + cmd] = this.execute.bind(this, cmd) })

    this._subscriptions = new CompositeDisposable()
    this._subscriptions.add(
      atom.config.observe('go-debug.limitCommandsToGo', this.observeCommandsLimit.bind(this)),
      atom.commands.add('atom-workspace', {
        'go-debug:edit-breakpoint-condition': this.handleBreakpointCondition.bind(this)
      })
    )
  }

  execute (n: string, event: atom$CustomEvent) {
    event.stopPropagation()

    if (this.onExecute) {
      this.onExecute(n)
    }
    commands[n](this._store, this._dbg)
  }

  observeCommandsLimit (limitCommandsToGo: boolean) {
    const ks = this._keyboardSubscription
    if (ks) {
      ks.dispose()
      this._subscriptions.remove(ks)
    }

    let selector = 'atom-workspace'
    if (limitCommandsToGo === true) {
      selector = 'atom-text-editor[data-grammar~=\'go\']'
    }
    this._keyboardSubscription = atom.commands.add(selector + ', .go-debug-panel, .go-debug-output', this._keyboardCommands)
    this._subscriptions.add(this._keyboardSubscription)
  }

  handleBreakpointCondition (ev: Event) {
    if (!(ev.target instanceof HTMLElement)) {
      return
    }
    const name = elementPropInHierarcy(ev.target, 'dataset.name')
    if (typeof name !== 'string') {
      return
    }
    const bp = getBreakpointByName(this._store, name)
    if (!bp) {
      return
    }
    editBreakpointCondition(bp).then((cond) => {
      this._dbg.editBreakpoint(name, { cond })
    })
  }

  dispose () {
    this._subscriptions.dispose()
    delete this._subscriptions
  }
}
