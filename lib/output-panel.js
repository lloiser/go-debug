'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'
import TextInput from './text-input'
import { Variables } from './variables'

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

    const elements = model.props.content.map(({ type, value }) => {
      if (type === 'text') {
        return <span innerHTML={value} />
      }
      if (type === 'eval') {
        return <Variables variables={value} />
      }
      return null
    }).filter((v) => !!v)

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
