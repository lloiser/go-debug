'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'
import TextInput from './text-input'
import { location } from './utils'

export class BreakpointCondition extends EtchComponent {
  constructor (props, children) {
    super(props, children)
    document.addEventListener('click', this.handleDocumentClick, false)
  }
  destroy () {
    document.removeEventListener('click', this.handleDocumentClick, false)
    super.destroy()
  }

  render () {
    return <div className='go-debug-breakpoint-condition'>
      <b className='block'>Breakpoint condition on {this.props.location}</b>
      <TextInput autoFocus value={this.props.condition} onChange={this.handleChange}
        onDone={this.handleDone} onCancel={this.handleCancel} />
    </div>
  }

  handleChange (condition) {
    this.update({ condition })
  }
  handleDone (condition) {
    this.props.onDone(condition)
  }
  handleCancel () {
    this.props.onCancel()
  }

  handleDocumentClick (ev) {
    if (!this.element.contains(ev.target)) {
      this.props.onDone(this.props.condition)
    }
  }
}
BreakpointCondition.bindFns = ['handleChange', 'handleDone', 'handleCancel', 'handleDocumentClick']

export function editBreakpointCondition (bp) {
  return new Promise((resolve) => {
    const component = new BreakpointCondition({
      condition: bp.cond || '',
      location: location(bp),
      onCancel: () => {
        component.destroy()
        modal.destroy()
      },
      onDone: (condition) => {
        component.destroy()
        modal.destroy()
        resolve(condition)
      }
    })
    const modal = atom.workspace.addModalPanel({ item: component.element })
  })
}
