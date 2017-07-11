'use babel'
/** @jsx etch.dom */

import { CompositeDisposable } from 'atom'

import etch from 'etch'
import EtchComponent from './etch-component'
import EtchStoreComponent from './etch-store-component'

import Expandable from './expandable'
import { BreakpointsContainer } from './breakpoints'
import { StacktraceContainer } from './stacktrace'
import { GoroutinesContainer } from './goroutines'
import { VariablesContainer } from './variables'
import { WatchExpressionsContainer } from './watch-expressions'

import { getEditor, elementPropInHierarcy } from './utils'

export class Panel extends EtchComponent {
  constructor (props, children) {
    props.expanded = {
      stacktrace: true,
      goroutines: true,
      variables: true,
      watchExpressions: true,
      breakpoints: true
    }

    super(props, children)
  }

  render () {
    return <div className='go-debug-panel'>
      {this.renderConfigsOrCommands()}
      {this.renderContent()}
    </div>
  }
  renderConfigsOrCommands () {
    if (this.props.dbg.isStarted()) {
      return this.renderCommands()
    }
    return this.renderConfigs()
  }
  renderConfigs () {
    const { selectedConfig, configurations } = this.props

    let file
    const configsByNames = {}

    configurations.forEach((c) => {
      if (!c) {
        return
      }
      c.configs.forEach(({ name }) => {
        configsByNames[name] = true
        if (name === selectedConfig) {
          file = c.file
        }
      })
    })

    const options = [<option key='no config' value='' selected={selectedConfig === ''}>Select a config</option>].concat(
      Object.keys(configsByNames).sort().map(
        (name) => <option value={name} selected={selectedConfig === name}>{name}</option>
      )
    )

    return <div className='go-debug-panel-configs'>
      <button type='button' className='btn go-debug-btn-flat' title='Start this configuration'
        onclick={this.handleStartConfig} disabled={selectedConfig === ''}>
        <span className='icon-playback-play' />
      </button>
      <select onchange={this.handleSelectConfig}>{options}</select>
      <button type='button' className='btn go-debug-btn-flat' title='Change configuration'
        onclick={this.handleEditConfig} disabled={!file} dataset={{ file }}>
        <span className='icon-gear' />
      </button>
    </div>
  }
  renderCommands () {
    const { state } = this.props
    return <div className='go-debug-panel-commands'>
      {state === 'running'
        ? this.renderCommand('halt', 'playback-pause', 'Halt')
        : this.renderCommand('resume', 'playback-play', 'Resume')}
      {this.renderCommand('next', 'arrow-right', 'Next')}
      {this.renderCommand('stepIn', 'arrow-down', 'Step in')}
      {this.renderCommand('stepOut', 'arrow-up', 'Step out')}
      {this.renderCommand('stop', 'primitive-square', 'Stop')}
      {this.renderCommand('restart', 'sync', 'Restart')}
    </div>
  }
  renderCommand (cmd, icon, title) {
    return <button key={cmd} type='button' className='btn go-debug-btn-flat'
      title={title} dataset={{ cmd }} onclick={this.handleCommandClick}>
      <span className={'icon-' + icon} />
    </button>
  }

  renderContent () {
    const { expanded, store, dbg } = this.props
    return <div className='go-debug-panel-content'>
      <Expandable expanded={expanded.stacktrace} name='stacktrace' title='Stacktrace' onChange={this.handleExpandChange}>
        <StacktraceContainer store={store} dbg={dbg} />
      </Expandable>
      <Expandable expanded={expanded.goroutines} name='goroutines' title='Goroutines' onChange={this.handleExpandChange}>
        <GoroutinesContainer store={store} dbg={dbg} />
      </Expandable>
      <Expandable expanded={expanded.variables} name='variables' title='Variables' onChange={this.handleExpandChange}>
        <VariablesContainer store={store} dbg={dbg} />
      </Expandable>
      <Expandable expanded={expanded.watchExpressions} name='watchExpressions' title='Watch expressions' onChange={this.handleExpandChange}>
        <WatchExpressionsContainer store={store} dbg={dbg} />
      </Expandable>
      <Expandable expanded={expanded.breakpoints} name='breakpoints' title='Breakpoints' onChange={this.handleExpandChange}>
        <BreakpointsContainer store={store} dbg={dbg} />
      </Expandable>
    </div>
  }

  handleExpandChange (name) {
    const expanded = Object.assign({}, this.props.expanded)
    expanded[name] = !expanded[name]
    this.update({ expanded })
  }

  handleSelectConfig (ev) {
    this.props.store.dispatch({ type: 'SET_SELECTED_CONFIG', configName: ev.target.value })
  }

  handleEditConfig (ev) {
    const file = elementPropInHierarcy(ev.target, 'dataset.file')
    atom.workspace.open(file, { searchAllPanes: true })
  }

  handleStartConfig () {
    const { selectedConfig, configurations } = this.props
    const config = configurations.reduce(
      (v, c) => (c && c.configs.find(({ name }) => name === selectedConfig)) || v,
      null
    )
    const editor = getEditor()
    const file = editor && editor.getPath()
    this.props.dbg.start(config, file)
  }

  handleCommandClick (ev) {
    const command = elementPropInHierarcy(ev.target, 'dataset.cmd')
    atom.commands.dispatch(ev.target, 'go-debug:' + command)
  }
}
Panel.bindFns = [
  'handleExpandChange', 'handleCommandClick',
  'handleSelectConfig', 'handleStartConfig', 'handleEditConfig'
]

export const PanelContainer = EtchStoreComponent.create(
  Panel,
  (state) => {
    return {
      configurations: state.configurations,
      selectedConfig: state.selectedConfig,
      state: state.delve.state
    }
  }
)

export class PanelManager {
  constructor (store, dbg, commands) {
    this._store = store
    this._dbg = dbg
    this._commands = commands

    // show the panel whenever the user starts a new session via the keyboard shortcut
    commands.onExecute = (key) => {
      if (key === 'start') {
        this.togglePanel(true)
      }
    }

    this._subscriptions = new CompositeDisposable(
      atom.commands.add('atom-workspace', {
        'go-debug:toggle-panel': () => this.togglePanel()
      })
    )

    this.createPanel(atom.config.get('go-debug.panelInitialVisible') || false)
  }

  dispose () {
    const pane = atom.workspace.paneForItem(this._atomPanel)
    if (pane) {
      pane.destroyItem(this._atomPanel, true)
    }

    this._subscriptions.dispose()
    this._subscriptions = null

    this._component = null
    this._atomPanel = null
  }

  createPanel (visible) {
    if (!this._component) {
      this._component = new PanelContainer({ store: this._store, dbg: this._dbg })
      this._subscriptions.add(this._component)
    }
    this._atomPanel = {
      element: this._component.element,
      getURI: () => 'atom://go-debug/panel',
      getTitle: () => 'Debugger',
      getDefaultLocation: () => 'right',
      getAllowedLocations: () => ['right', 'left']
    }
    return atom.workspace.open(this._atomPanel, {
      activatePane: visible
    })
  }

  togglePanel (visible) {
    const paneContainer = atom.workspace.paneContainerForItem(this._atomPanel)
    if (!paneContainer) {
      this.createPanel(true)
      return
    }
    if (visible === undefined) {
      visible = !paneContainer.isVisible()
    }
    if (visible) {
      paneContainer.show()
    } else {
      paneContainer.hide()
    }
  }
}
