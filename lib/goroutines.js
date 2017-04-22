'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'
import EtchStoreComponent from './etch-store-component'

import { elementPropInHierarcy, location } from './utils'

export class Goroutines extends EtchComponent {
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

  handleGoroutineClick (ev) {
    const id = elementPropInHierarcy(ev.target, 'dataset.id')
    if (id) {
      this.props.dbg.selectGoroutine(+id)
    }
  }
}
Goroutines.bindFns = ['handleGoroutineClick']

export const GoroutinesContainer = EtchStoreComponent.create(
  Goroutines,
  (state) => {
    const { delve } = state
    return {
      goroutines: delve.goroutines,
      selectedGoroutine: delve.selectedGoroutine
    }
  }
)
