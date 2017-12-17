/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { EtchComponent } from './etch-component'
import { connect } from './etch-store-component'

import { elementPropInHierarcy, location } from './utils'

import type { Store } from './store'
import type { Debugger } from './debugger'
import type { State, Stacktrace as DebuggerStacktrace } from './debugger-flow-types'
import type { EtchStoreComponentProps } from './etch-store-component'

declare type StacktraceProps = {|
  store: Store,
  dbg: Debugger,
  stacktrace: DebuggerStacktrace[],
  selectedStacktrace: number
|}
export class Stacktrace extends EtchComponent<StacktraceProps> {
  handleStacktraceClick: Function

  init () {
    this.handleStacktraceClick = this.handleStacktraceClick.bind(this)
  }

  render () {
    const { selectedStacktrace, stacktrace = [] } = this.props
    const items = stacktrace.map((st, index) => {
      const className = selectedStacktrace === index ? 'selected' : null
      return <div key={index} className={className} dataset={{ index }} onclick={this.handleStacktraceClick}>
        <div>{st.func}</div>
        <div>@ {location(st)}</div>
      </div>
    })
    if (items.length === 0) {
      return <div className='go-debug-panel-stacktrace-empty'>No stacktrace</div>
    }
    return <div className='go-debug-panel-stacktrace'>{items}</div>
  }

  handleStacktraceClick (ev: Event) {
    if (!(ev.target instanceof HTMLElement)) {
      return
    }
    const index = elementPropInHierarcy(ev.target, 'dataset.index')
    if (index != null) {
      this.props.dbg.selectStacktrace(+index)
    }
  }
}

export const StacktraceContainer = connect(
  Stacktrace,
  (props: EtchStoreComponentProps, state: State): StacktraceProps => {
    const { delve } = state
    return {
      store: props.store,
      dbg: props.dbg,
      stacktrace: delve.stacktrace,
      selectedStacktrace: delve.selectedStacktrace
    }
  }
)
