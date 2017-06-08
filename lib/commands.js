'use babel'

import { CompositeDisposable } from 'atom'
import { getEditor, elementPropInHierarcy } from './utils'
import { editBreakpointCondition } from './breakpoint-condition'
import { getBreakpointByName } from './store-utils'

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
    if (!file) {
      return
    }
    dbg.toggleBreakpoint(file, currentLine())
  }
}

export default class Commands {
  constructor (store, dbg) {
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

  execute (n) {
    if (this.onExecute) {
      this.onExecute(n)
    }
    commands[n](this._store, this._dbg)
  }

  observeCommandsLimit (limitCommandsToGo) {
    if (this._keyboardSubscription) {
      this._subscriptions.remove(this._keyboardSubscription)
      this._keyboardSubscription.dispose()
    }

    let selector = 'atom-workspace'
    if (limitCommandsToGo === true) {
      selector = 'atom-text-editor[data-grammar~=\'go\']'
    }
    this._keyboardSubscription = atom.commands.add(selector + ', .go-debug-panel, .go-debug-output', this._keyboardCommands)
    this._subscriptions.add(this._keyboardSubscription)
  }

  handleBreakpointCondition (ev) {
    const name = elementPropInHierarcy(ev.target, 'dataset.name')
    if (!name) {
      return
    }
    const bp = getBreakpointByName(this._store, name)
    editBreakpointCondition(bp).then((cond) => {
      this._dbg.editBreakpoint(name, { cond })
    })
  }

  dispose () {
    this._subscriptions.dispose()
    this._subscriptions = null
  }
}
