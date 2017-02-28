'use babel'

import { CompositeDisposable } from 'atom'
import { elementPropInHierarcy } from './utils'
import { editBreakpointCondition } from './breakpoint-condition'
import { getBreakpointByName } from './store-utils'

function currentEditor () {
  return atom.workspace.getActiveTextEditor()
}

function currentFile () {
  const editor = currentEditor()
  return editor && editor.getPath()
}

function currentLine () {
  const editor = currentEditor()
  return editor && editor.getCursorBufferPosition().row
}

const commands = {
  'start': {
    cmd: 'start',
    text: 'Start',
    title: 'Start this configuration',
    action: (store, dbg) => {
      const { selectedConfig, configurations } = store.getState()
      let config
      if (selectedConfig) {
        config = configurations.reduce(
          (v, c) => (c && c.configs.find(({ name }) => name === selectedConfig)) || v,
          null
        )
      }
      dbg.start(config, currentFile())
    }
  },
  'resume': {
    cmd: 'resume',
    icon: 'triangle-right',
    title: 'Resume',
    action: (store, dbg) => dbg.resume()
  },
  'next': {
    cmd: 'next',
    icon: 'arrow-right',
    title: 'Next',
    action: (store, dbg) => dbg.next()
  },
  'stepIn': {
    cmd: 'stepIn',
    icon: 'arrow-down',
    title: 'Step',
    action: (store, dbg) => dbg.stepIn()
  },
  'stepOut': {
    cmd: 'stepOut',
    icon: 'arrow-up',
    title: 'Step',
    action: (store, dbg) => dbg.stepOut()
  },
  'restart': {
    cmd: 'restart',
    icon: 'sync',
    title: 'Restart',
    action: (store, dbg) => dbg.restart()
  },
  'stop': {
    cmd: 'stop',
    icon: 'primitive-square',
    title: 'Stop',
    action: (store, dbg) => dbg.stop()
  },
  'toggle-breakpoint': {
    action: (store, dbg) => {
      const file = currentFile()
      if (!file) {
        return
      }
      dbg.toggleBreakpoint(file, currentLine())
    }
  }
}

const panelCommands = [
  commands.resume,
  commands.next,
  commands.stepIn,
  commands.stepOut,
  commands.restart,
  commands.stop
]

export default class Commands {
  constructor (store, dbg) {
    this._store = store
    this._dbg = dbg

    this._keyboardCommands = {}
    const toAdd = ['start', 'resume', 'next', 'stepIn', 'stepOut', 'restart', 'stop', 'toggle-breakpoint']
    toAdd.forEach((cmd) => { this._keyboardCommands['go-debug:' + cmd] = this.execute.bind(this, cmd) })

    this._subscriptions = new CompositeDisposable()
    this._subscriptions.add(
      atom.config.observe('go-debug.limitCommandsToGo', this.observeCommandsLimit.bind(this)),
      atom.commands.add('atom-workspace', {
        'go-debug:edit-breakpoint-condition': this.handleBreakpointCondition.bind(this)
      })
    )

    this._commands = commands
    this.panelCommands = panelCommands
  }

  execute (n) {
    if (this.onExecute) {
      this.onExecute(n)
    }
    this._commands[n].action(this._store, this._dbg)
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
    this._keyboardSubscription = atom.commands.add(selector, this._keyboardCommands)
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
