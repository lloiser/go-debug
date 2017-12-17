/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { EtchComponent } from './etch-component'
import { TextInput } from './text-input'
import { location } from './utils'

import type { Breakpoint } from './debugger-flow-types'

declare type BreakpointConditionProps = {|
  condition: string,
  location: string,
  onCancel: () => void,
  onDone: (cond: string) => void
|}
declare type BreakpointConditionState = {|
  condition: string
|}

export class BreakpointCondition extends EtchComponent<BreakpointConditionProps, BreakpointConditionState> {
  handleChange: Function
  handleDone: Function
  handleCancel: Function
  handleDocumentClick: Function

  getInitialState (): BreakpointConditionState {
    return {
      condition: this.props.condition
    }
  }

  init () {
    this.handleChange = this.handleChange.bind(this)
    this.handleDone = this.handleDone.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.handleDocumentClick = this.handleDocumentClick.bind(this)

    document.addEventListener('click', this.handleDocumentClick, false)
  }

  destroy () {
    document.removeEventListener('click', this.handleDocumentClick, false)
    super.destroy()
  }

  render () {
    return <div className='go-debug-breakpoint-condition'>
      <b className='block'>Breakpoint condition on {this.props.location}</b>
      <TextInput autofocus value={this.state.condition} onChange={this.handleChange}
        onDone={this.handleDone} onCancel={this.handleCancel} />
    </div>
  }

  handleChange (condition: string) {
    this.setState({ condition })
  }
  handleDone (condition: string) {
    this.props.onDone(condition)
  }
  handleCancel () {
    this.props.onCancel()
  }

  handleDocumentClick (ev: MouseEvent) {
    if (!(ev.target instanceof HTMLElement)) {
      return
    }
    if (!this.element.contains(ev.target)) {
      this.props.onDone(this.state.condition)
    }
  }
}

export function editBreakpointCondition (bp: Breakpoint): Promise<string> {
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
