'use babel'
/** @jsx etch.dom */

import * as fs from 'fs'
import etch from 'etch'
import EtchComponent from './etch-component'
import EtchStoreComponent from './etch-store-component'

import { getBreakpoints } from './store-utils'
import { location, elementPropInHierarcy, openFile } from './utils'

export class Breakpoints extends EtchComponent {
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

  handleBreakpointClick (ev) {
    const file = elementPropInHierarcy(ev.target, 'dataset.file')
    if (file) {
      const line = +elementPropInHierarcy(ev.target, 'dataset.line')
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
  handleRemoveBreakpointClick (ev) {
    const name = elementPropInHierarcy(ev.target, 'dataset.name')
    if (name) {
      this.props.dbg.removeBreakpoint(name)
      ev.preventDefault()
      ev.stopPropagation()
    }
  }

  fileExists (file) {
    return new Promise((resolve) => {
      fs.stat(file, (err) => resolve(!err))
    })
  }

  removeBreakpoints (file) {
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
Breakpoints.bindFns = ['handleBreakpointClick', 'handleRemoveBreakpointClick']

export const BreakpointsContainer = EtchStoreComponent.create(
  Breakpoints,
  (state) => {
    const { delve } = state
    return {
      breakpoints: delve.breakpoints
    }
  }
)
