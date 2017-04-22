'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'
import { editorStyle } from './utils'

export default class TextInput extends EtchComponent {
  constructor (props, children) {
    if (!props.value && props.value !== 0) {
      props.value = ''
    }
    super(props, children)

    if (props.autoFocus) {
      this.refs.input.focus()
    }
  }

  render () {
    return <div style={editorStyle()} className='go-debug-text-input native-key-bindings'>
      <input ref='input' type='text' value={this.props.value || ''} placeholder={this.props.placeholder || ''}
        on={{ keydown: this.handleKeyDown, input: this.handleInput }} />
    </div>
  }

  handleInput (ev) {
    if (this.props.onChange) {
      this.props.onChange(ev.target.value)
    }
  }

  handleKeyDown (ev) {
    if (ev.key === 'Enter' && this.props.onDone) {
      ev.preventDefault()
      this.props.onDone(ev.target.value)
      return
    }
    if (ev.key === 'Escape' && this.props.onCancel) {
      ev.preventDefault()
      this.props.onCancel()
      return
    }
    if (this.props.onKeyDown) {
      this.props.onKeyDown(ev)
    }
  }
}
