/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { EtchComponent } from './etch-component'
import { connect } from './etch-store-component'

import { elementPropInHierarcy, location } from './utils'

import type { Store } from './store'
import type { Debugger } from './debugger'
import type { State, Goroutine } from './debugger-flow-types'
import type { EtchStoreComponentProps } from './etch-store-component'

declare type GoroutinesProps = {|
  store: Store,
  dbg: Debugger,
  goroutines: Goroutine[],
  selectedGoroutine: number
|}
export class Goroutines extends EtchComponent<GoroutinesProps> {
  handleGoroutineClick: Function

  init () {
    this.handleGoroutineClick = this.handleGoroutineClick.bind(this)
  }

  render () {
    const { selectedGoroutine, goroutines = [] } = this.props
    const items = goroutines.map((t) => {
      const className = selectedGoroutine === t.id ? 'selected' : null
      return <div key={t.id} className={className} dataset={{ id: t.id }} onclick={this.handleGoroutineClick}>
        <div>{t.func}</div>
        <div>@ {location(t)}</div>
      </div>
    })
    if (items.length === 0) {
      return <div className='go-debug-panel-goroutines-empty'>No goroutines</div>
    }
    return <div className='go-debug-panel-goroutines'>{items}</div>
  }

  handleGoroutineClick (ev: Event) {
    if (!(ev.target instanceof HTMLElement)) {
      return
    }
    const id = elementPropInHierarcy(ev.target, 'dataset.id')
    if (id != null) {
      this.props.dbg.selectGoroutine(+id)
    }
  }
}

export const GoroutinesContainer = connect(
  Goroutines,
  (props: EtchStoreComponentProps, state: State): GoroutinesProps => {
    const { delve } = state
    return {
      store: props.store,
      dbg: props.dbg,
      goroutines: delve.goroutines,
      selectedGoroutine: delve.selectedGoroutine
    }
  }
)
