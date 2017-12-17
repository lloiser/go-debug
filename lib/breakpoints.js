/* @flow */
/** @jsx etch.dom */

import * as fs from 'fs'
import etch from 'etch'
import { EtchComponent } from './etch-component'
import { connect } from './etch-store-component'

import { getBreakpoints } from './store-utils'
import { location, elementPropInHierarcy, openFile } from './utils'

import type { Store } from './store'
import type { Debugger } from './debugger'
import type { State, Breakpoint } from './debugger-flow-types'
import type { EtchStoreComponentProps } from './etch-store-component'

declare type BreakpointsProps = {|
  store: Store,
  dbg: Debugger,
  breakpoints: Breakpoint[]
|}

export class Breakpoints extends EtchComponent<BreakpointsProps> {
  handleBreakpointClick: Function
  handleRemoveBreakpointClick: Function

  init () {
    this.handleBreakpointClick = this.handleBreakpointClick.bind(this)
    this.handleRemoveBreakpointClick = this.handleRemoveBreakpointClick.bind(this)
  }

  render () {
    const { breakpoints = [] } = this.props
    const items = breakpoints.map((bp) => {
      const { name, file, line, state, message } = bp
      return <div key={name} dataset={{ name, file, line }} title={message || ''} onclick={this.handleBreakpointClick}>
        <button className='btn go-debug-btn-flat' onClick={this.handleRemoveBreakpointClick}>
          <span className='go-debug-icon icon icon-x' />
        </button>
        <span className={'go-debug-breakpoint go-debug-breakpoint-state-' + state} />
        {location(bp)}
      </div>
    })
    if (items.length === 0) {
      return <div className='go-debug-panel-breakpoints-empty'>No breakpoints</div>
    }
    return <div className='go-debug-panel-breakpoints'>
      {items}
    </div>
  }

  handleBreakpointClick (ev: MouseEvent) {
    const { target } = ev
    if (!(target instanceof HTMLElement)) {
      return
    }
    const file = elementPropInHierarcy(target, 'dataset.file')
    if (typeof file === 'string') {
      const line = +elementPropInHierarcy(target, 'dataset.line')
      // check if the file even exists
      this.fileExists(file)
        .then((exists) => {
          if (exists) {
            openFile(file, line)
          } else {
            this.removeBreakpoints(file)
          }
        })
    }
  }
  handleRemoveBreakpointClick (ev: MouseEvent) {
    if (!(ev.target instanceof HTMLElement)) {
      return
    }
    const name = elementPropInHierarcy(ev.target, 'dataset.name')
    if (typeof name === 'string') {
      this.props.dbg.removeBreakpoint(name)
      ev.preventDefault()
      ev.stopPropagation()
    }
  }

  fileExists (file: string): Promise<boolean> {
    return new Promise((resolve) => {
      fs.stat(file, (err) => resolve(!err))
    })
  }

  removeBreakpoints (file: string) {
    const noti = atom.notifications.addWarning(
      `The file ${file} does not exist anymore.`,
      {
        dismissable: true,
        detail: 'Remove all breakpoints for this file?',
        buttons: [{
          text: 'Yes',
          onDidClick: () => {
            noti.dismiss()
            getBreakpoints(this.props.store, file).forEach((bp) => this.props.dbg.removeBreakpoint(bp.name))
          }
        }, {
          text: 'No',
          onDidClick: () => noti.dismiss()
        }]
      }
    )
  }
}

export const BreakpointsContainer = connect(
  Breakpoints,
  (props: EtchStoreComponentProps, state: State): BreakpointsProps => {
    const { delve } = state
    return {
      store: props.store,
      dbg: props.dbg,
      breakpoints: delve.breakpoints
    }
  }
)
