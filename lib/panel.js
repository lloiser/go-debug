/* @flow */
/** @jsx etch.dom */

import { CompositeDisposable } from 'atom'

import etch from 'etch'
import { EtchComponent } from './etch-component'
import { connect } from './etch-store-component'

import { Expandable } from './expandable'
import { BreakpointsContainer } from './breakpoints'
import { StacktraceContainer } from './stacktrace'
import { GoroutinesContainer } from './goroutines'
import { VariablesContainer } from './variables'
import { WatchExpressionsContainer } from './watch-expressions'

import { isStarted } from './store-utils'
import * as Actions from './store-actions'

import type { Debugger } from './debugger'
import type { Store } from './store'
import type { Commands } from './commands'
import type { State, DebuggerState, ConfigurationFile } from './debugger-flow-types'
import type { EtchStoreComponentProps } from './etch-store-component'

declare type PanelProps = {|
  store: Store,
  dbg: Debugger,
  configurations: ConfigurationFile[],
  selectedConfig: string,
  state: DebuggerState
|}
declare type PanelState = {|
  expanded: {
    stacktrace: boolean,
    goroutines: boolean,
    variables: boolean,
    watchExpressions: boolean,
    breakpoints: boolean
  }
|}
export class Panel extends EtchComponent<PanelProps, PanelState> {
  handleExpandChange: Function
  handleSelectConfig: Function
  handleEditConfig: Function
  handleCommandClick: Function

  getInitialState (): PanelState {
    return {
      expanded: {
        stacktrace: true,
        goroutines: true,
        variables: true,
        watchExpressions: true,
        breakpoints: true
      }
    }
  }

  init () {
    this.handleExpandChange = this.handleExpandChange.bind(this)
    this.handleSelectConfig = this.handleSelectConfig.bind(this)
    this.handleEditConfig = this.handleEditConfig.bind(this)
    this.handleCommandClick = this.handleCommandClick.bind(this)
  }

  render () {
    return <div className='go-debug-panel'>
      {this.renderConfigsOrCommands()}
      {this.renderContent()}
    </div>
  }
  renderConfigsOrCommands () {
    if (isStarted(this.props.state)) {
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
      {this.renderCommand('start', 'playback-play', 'Start this configuration', selectedConfig === '')}
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
  renderCommand (cmd: string, icon: string, title: string, disabled?: boolean) {
    return <button key={cmd} type='button' className='btn go-debug-btn-flat'
      title={title} dataset={{ cmd }} onclick={this.handleCommandClick} disabled={disabled}>
      <span className={'icon-' + icon} />
    </button>
  }

  renderContent () {
    const { store, dbg } = this.props
    const { expanded } = this.state

    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe
    // TODO: find a way to make "path" typesafe

    return <div className='go-debug-panel-content'>
      <Expandable expanded={expanded.stacktrace} name='stacktrace' title='Stacktrace' onChange={this.handleExpandChange}>
        <StacktraceContainer store={store} dbg={dbg} />
      </Expandable>
      <Expandable expanded={expanded.goroutines} name='goroutines' title='Goroutines' onChange={this.handleExpandChange}>
        <GoroutinesContainer store={store} dbg={dbg} />
      </Expandable>
      <Expandable expanded={expanded.variables} name='variables' title='Variables' onChange={this.handleExpandChange}>
        <VariablesContainer store={store} dbg={dbg} path='' />
      </Expandable>
      <Expandable expanded={expanded.watchExpressions} name='watchExpressions' title='Watch expressions' onChange={this.handleExpandChange}>
        <WatchExpressionsContainer store={store} dbg={dbg} />
      </Expandable>
      <Expandable expanded={expanded.breakpoints} name='breakpoints' title='Breakpoints' onChange={this.handleExpandChange}>
        <BreakpointsContainer store={store} dbg={dbg} />
      </Expandable>
    </div>
  }

  handleExpandChange (name: string) {
    const { expanded } = this.state
    this.setState({
      expanded: { ...expanded, [name]: !expanded[name] }
    })
  }

  handleSelectConfig (ev: Event) {
    if (!(ev.target instanceof HTMLSelectElement)) {
      return
    }
    this.props.store.dispatch(Actions.setSelectedConfig(ev.target.value))
  }

  handleEditConfig (ev: MouseEvent) {
    if (!(ev.currentTarget instanceof HTMLButtonElement)) {
      return
    }
    const file = ev.currentTarget.dataset.file
    atom.workspace.open(file, { searchAllPanes: true })
  }

  handleCommandClick (ev: MouseEvent) {
    const { currentTarget } = ev
    if (!(currentTarget instanceof HTMLButtonElement)) {
      return
    }
    atom.commands.dispatch(currentTarget, 'go-debug:' + currentTarget.dataset.cmd)
  }
}

export const PanelContainer = connect(
  Panel,
  (props: EtchStoreComponentProps, state: State): PanelProps => {
    return {
      store: props.store,
      dbg: props.dbg,
      configurations: state.configurations,
      selectedConfig: state.selectedConfig,
      state: state.state
    }
  }
)

export class PanelManager {
  _store: Store
  _dbg: Debugger
  _commands: Commands
  _subscriptions: CompositeDisposable
  _atomPanel: ?atom$PaneItem
  _component: ?EtchComponent<EtchStoreComponentProps, any>

  constructor (store: Store, dbg: Debugger, commands: Commands) {
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

    let visible: boolean = false
    const panelInitialVisible = atom.config.get('go-debug.panelInitialVisible')
    if (typeof panelInitialVisible === 'boolean') {
      visible = panelInitialVisible
    }
    this.createPanel(visible)
  }

  dispose () {
    const pane = atom.workspace.paneForItem(this._atomPanel)
    if (pane && this._atomPanel) {
      pane.destroyItem(this._atomPanel, true)
    }

    this._subscriptions.dispose()
    delete this._subscriptions

    this._component = null
    this._atomPanel = null
  }

  createPanel (visible: boolean) {
    if (!this._component) {
      const c = new PanelContainer({ store: this._store, dbg: this._dbg })
      this._subscriptions.add(c)
      this._component = c
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

  togglePanel (visible?: boolean) {
    const paneContainer = atom.workspace.paneContainerForItem(this._atomPanel)
    if (!paneContainer) {
      this.createPanel(true)
      return
    }
    const v = visible == null ? !paneContainer.isVisible() : visible
    if (v) {
      paneContainer.show()
    } else {
      paneContainer.hide()
    }
  }
}
