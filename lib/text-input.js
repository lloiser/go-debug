'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'

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
    const style = {
      'font-family': atom.config.get('editor.fontFamily'),
      'font-size': atom.config.get('editor.fontSize'),
      'line-height': atom.config.get('editor.lineHeight')
    }
    return <div style={style} className='go-debug-text-input native-key-bindings'>
      <input ref='input' type='text' value={this.props.value}
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
