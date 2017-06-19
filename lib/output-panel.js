'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'
import TextInput from './text-input'
import { Variables } from './variables'

const contentTypes = {
  'message': ({ message }) => <span innerHTML={message} />,
  'eval': ({ variables }) => <Variables variables={variables} />,
  'dlvSpawnOptions': (input) => {
    return <DlvSpawnOptions {...input} />
  }
}

export default class OutputPanel extends EtchComponent {
  init () {
    if (this.props.model) {
      this.props.model.view = this
    }
    super.init()
  }

  shouldUpdate () {
    return true
  }

  render () {
    const { model } = this.props
    if (!model || !model.ready()) {
      return <div>The debugger is not ready ...</div>
    }

    const elements = model.props.content.map((o) => {
      const fn = contentTypes[o.type]
      return fn ? fn(o) : null
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
    if (!content) {
      return
    }

    let scrollHeight = content.scrollHeight
    if (scrollHeight && this.scrollHeight !== scrollHeight) {
      this.scrollHeight = scrollHeight
      content.scrollTop = this.scrollHeight
      this.update()
    }
  }
}

class DlvSpawnOptions extends EtchComponent {
  constructor (props, children) {
    super({ expanded: false, ...props }, children)
  }
  handleExpandChange () {
    this.update({ expanded: !this.props.expanded })
  }
  render () {
    const { path, args, cwd, expanded } = this.props
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
    const { env } = this.props
    const items = Object.keys(env).sort().map((key) => <div>{key}={env[key]}</div>)
    return <div className='dlvspawnoptions-indent'>{items}</div>
  }
}
DlvSpawnOptions.bindFns = ['handleExpandChange']
