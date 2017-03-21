'use babel'
/** @jsx etch.dom */
/* eslint-disable react/no-unknown-property */

import { CompositeDisposable } from 'atom'

import etch from 'etch'
import EtchComponent from './etch-component'
import EtchStoreComponent from './etch-store-component'

import Expandable from './expandable'
import { BreakpointsContainer } from './breakpoints'
import { StacktraceContainer } from './stacktrace'
import { GoroutinesContainer } from './goroutines'
import { VariablesContainer } from './variables'

import { elementPropInHierarcy } from './utils'

export class Panel extends EtchComponent {
  constructor (props, children) {
    props.resizing = false
    props.expanded = {
      stacktrace: true,
      goroutines: true,
      variables: true,
      breakpoints: true
    }

    super(props, children)
  }

  render () {
    const { width } = this.props
    return <div className='go-debug-panel' style={{ width: width ? width + 'px' : undefined }}>
      <div className='go-debug-panel-resizer' onmousedown={this.handleResizeStart} />
      {this.renderHeader()}
      {this.renderContent()}
    </div>
  }

  renderHeader () {
    return <div className='go-debug-panel-header'>
      <h3 className='go-debug-panel-title'>Debugger</h3>
      {this.renderConfigsOrCommands()}
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

    return <div>
      <button type='button' className='btn go-debug-btn-flat' title='Start'
        onclick={this.handleStartConfig} disabled={selectedConfig === ''}>
        <span className='icon-triangle-right' />
      </button>
      <select onchange={this.handleSelectConfig}>{options}</select>
      <button type='button' className='btn go-debug-btn-flat' dataset={{ file }}
        title='Start' disabled={!file} onclick={this.handleEditConfig}>
        <span className='icon-gear' />
      </button>
    </div>
  }
  renderCommands () {
    return <div className='go-debug-panel-commands'>
      {this.props.commands.panelCommands.map(this.renderCommand, this)}
    </div>
  }
  renderCommand (cmd) {
    return <button key={cmd.cmd} type='button' className='btn go-debug-btn-flat'
      title={cmd.title} dataset={{ cmd: cmd.cmd }} onclick={this.handleCommandClick}>
      {cmd.icon ? <span className={'icon-' + cmd.icon} /> : null}
      {cmd.text || null}
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
      <Expandable expanded={expanded.breakpoints} name='breakpoints' title='Breakpoints' onChange={this.handleExpandChange}>
        <BreakpointsContainer store={store} dbg={dbg} />
      </Expandable>
    </div>
  }

  handleResizeStart () {
    document.addEventListener('mousemove', this.handleResize, false)
    document.addEventListener('mouseup', this.handleResizeEnd, false)
    this.update({ resizing: true })
  }
  handleResize ({ pageX }) {
    if (!this.props.resizing) {
      return
    }
    const node = this.element.offsetParent
    const width = node.getBoundingClientRect().width + node.offsetLeft - pageX
    this.update({ width })
  }
  handleResizeEnd () {
    if (!this.props.resizing) {
      return
    }
    document.removeEventListener('mousemove', this.handleResize, false)
    document.removeEventListener('mouseup', this.handleResizeEnd, false)
    this.update({ resizing: false })
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
    const editor = atom.workspace.getActiveTextEditor()
    const file = editor && editor.getPath()
    this.props.dbg.start(config, file)
  }

  handleCommandClick (ev) {
    const command = elementPropInHierarcy(ev.target, 'dataset.cmd')
    this.props.commands.execute(command)
  }
}
Panel.bindFns = [
  'handleResizeStart', 'handleResize', 'handleResizeEnd', 'handleExpandChange',
  'handleSelectConfig', 'handleStartConfig', 'handleEditConfig', 'handleCommandClick'
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
        'go-debug:toggle-panel': () => this.togglePanel(!this._atomPanel.isVisible())
      })
    )

    this._component = new PanelContainer({ store, dbg, commands })

    this._atomPanel = atom.workspace.addRightPanel({
      item: this._component.element,
      visible: atom.config.get('go-debug.panelInitialVisible') || false
    })
  }

  dispose () {
    this._subscriptions.dispose()
    this._subscriptions = null

    this._component.dispose()
    this._component = null

    this._atomPanel.destroy()
    this._atomPanel = null
  }

  togglePanel (visible) {
    this._atomPanel[visible ? 'show' : 'hide']()
  }
}
