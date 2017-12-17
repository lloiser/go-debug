/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { EtchComponent } from './etch-component'
import { editorStyle } from './utils'

declare type TextInputProps = {|
  value: string,
  autofocus?: boolean,
  placeholder?: string,
  onChange?: (value: string) => void,
  onDone?: (value: string) => void,
  onCancel?: () => void,
  onKeyDown?: (ev: KeyboardEvent) => void,
  ref?: string
|}
export class TextInput extends EtchComponent<TextInputProps> {
  render () {
    return <div style={editorStyle()} className='go-debug-text-input native-key-bindings'>
      <input ref='input' type='text' value={this.props.value} placeholder={this.props.placeholder || ''}
        autofocus={this.props.autofocus} on={{ keydown: this.handleKeyDown, input: this.handleInput }} />
    </div>
  }

  handleInput (ev: Event) {
    const { onChange } = this.props
    if (ev.target instanceof HTMLInputElement && onChange) {
      onChange(ev.target.value)
    }
  }

  handleKeyDown (ev: KeyboardEvent) {
    const { key, target } = ev
    if (!(target instanceof HTMLInputElement)) {
      return
    }
    const { onDone, onCancel, onKeyDown } = this.props
    if (key === 'Enter' && onDone) {
      ev.preventDefault()
      onDone(target.value)
      return
    }
    if (key === 'Escape' && onCancel) {
      ev.preventDefault()
      onCancel()
      return
    }
    if (onKeyDown) {
      onKeyDown(ev)
    }
  }
}

// TODO
// TODO
// TODO
// TODO
// TODO
// TODO
// TODO
// TODO
// TODO
// TODO
// TODO
//
// void <TextInput value='' />
// void <TextInput /> // no value
// void <TextInput value={1} /> // value = string
// void <TextInput value='' autoFocus='' /> // autoFocus = boolean
// void <TextInput value='' asdf='' /> // non-exact so no problem
