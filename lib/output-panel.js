/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { EtchComponent } from './etch-component'
import { TextInput } from './text-input'
import { Variables } from './variables'

import type { OutputPanelManager } from './output-panel-manager'
import type {
  OutputContentMessage, OutputContentEval, OutputContentDelveSpawnOptions
} from './debugger-flow-types'

const contentTypes = {
  'message': (content: OutputContentMessage) => <span innerHTML={content.message} />,
  'eval': (content: OutputContentEval) => <Variables variables={content.variables} path='' />,
  'dlvSpawnOptions': (content: OutputContentDelveSpawnOptions) => {
    return <DlvSpawnOptions options={content} />
  }
}

declare type OutputPanelProps = {|
  model?: ?OutputPanelManager
|}
export class OutputPanel extends EtchComponent<OutputPanelProps> {
  scrollHeight: number = 0

  init () {
    if (this.props.model) {
      this.props.model.view = this
    }
  }

  shouldUpdate (props: OutputPanelProps) {
    return !!props.model
  }

  render () {
    const { model } = this.props
    if (!model) {
      return <div>The debugger is not ready ...</div>
    }

    const elements = model.props.content.map((o) => {
      const fn = contentTypes[o.type]
      return fn ? fn((o: any)) : null
    }).filter(Boolean)

    return <div className='go-debug-output' tabIndex={-1}>
      <div className='go-debug-output-sidebar'>
        <button type='button' className='btn go-debug-btn-flat icon icon-trashcan'
          onclick={model.handleClickClean} title='Clean' />
      </div>
      <div className='go-debug-output-content'>
        <div ref='content' className='output' scrollTop={this.scrollHeight}>
          {elements}
        </div>
        <TextInput value={model.props.replValue} placeholder='>' onChange={model.handleChangeRepl}
          onDone={model.handleEnterRepl} onKeyDown={model.handleKeyDownRepl} />
      </div>
    </div>
  }

  readAfterUpdate () {
    let content = this.refs.content
    if (!(content instanceof HTMLElement)) {
      return
    }

    let scrollHeight = content.scrollHeight
    if (scrollHeight && this.scrollHeight !== scrollHeight) {
      this.scrollHeight = scrollHeight
      content.scrollTop = this.scrollHeight
      this.update({ model: this.props.model })
    }
  }
}

declare type DlvSpawnOptionsProps = {|
  options: OutputContentDelveSpawnOptions
|}
declare type DlvSpawnOptionsState = {|
  expanded: boolean
|}
class DlvSpawnOptions extends EtchComponent<DlvSpawnOptionsProps, DlvSpawnOptionsState> {
  handleExpandChange: Function

  getInitialState (): DlvSpawnOptionsState {
    return { expanded: false }
  }
  init () {
    this.handleExpandChange = this.handleExpandChange.bind(this)
  }
  handleExpandChange () {
    this.setState({ expanded: !this.state.expanded })
  }
  render () {
    const { path, args, cwd } = this.props.options
    const { expanded } = this.state
    return <div>
      Running delve with:<br />
      <div className='dlvspawnoptions-indent'>Dlv path: {path}</div>
      <div className='dlvspawnoptions-indent'>Arguments: {args.join(' ')}</div>
      <div className='dlvspawnoptions-indent'>CWD: {cwd}</div>
      <div>
        <span className={'go-debug-icon icon icon-chevron-' + (expanded ? 'down' : 'right')}
          onclick={this.handleExpandChange} />&nbsp;Environment: {expanded ? null : '(...)'}
        {expanded ? this.renderEnv() : null}
      </div>
    </div>
  }
  renderEnv () {
    const { env } = this.props.options
    const items = Object.keys(env).sort().map((key) => <div>{key}={env[key]}</div>)
    return <div className='dlvspawnoptions-indent'>{items}</div>
  }
}
