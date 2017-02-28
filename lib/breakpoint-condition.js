'use babel'
/** @jsx etch.dom */
/* eslint-disable react/no-unknown-property */

import etch from 'etch'
import EtchComponent from './etch-component'
import { CompositeDisposable, TextEditor } from 'atom'
import { position } from './breakpoint-utils'

export class BreakpointCondition extends EtchComponent {
  constructor (props, children) {
    super(props, children)

    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(atom.commands.add(this.element, 'core:cancel', () => this.cancel())) // esc
    this.subscriptions.add(atom.commands.add(this.element, 'core:confirm', () => this.done())) // enter

    document.addEventListener('click', this.handleDocumentClick, false)

    const { editor } = this.refs
    editor.setText(props.bp.cond || '')

    this.subscriptions.add(editor.element.onDidAttach(() => {
      editor.element.focus()
    }))
  }
  destroy () {
    this.subscriptions.dispose()
    document.removeEventListener('click', this.handleDocumentClick, false)
    super.destroy()
  }

  render () {
    return <div className='go-debug-breakpoint-condition'>
      <div className='block'><b>Breakpoint condition on {position(this.props.bp)}</b></div>
      <TextEditor ref='editor' mini />
    </div>
  }

  done () {
    this.props.onDone(this.refs.editor.getText())
  }
  cancel () {
    this.props.onCancel()
  }

  handleDocumentClick (ev) {
    if (!this.element.contains(ev.target)) {
      this.done()
    }
  }
}
BreakpointCondition.bindFns = ['handleDocumentClick']

export function editBreakpointCondition (bp) {
  return new Promise((resolve) => {
    const component = new BreakpointCondition({
      bp,
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
