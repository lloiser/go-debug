/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { CompositeDisposable } from 'atom'

import { EtchComponent } from './etch-component'
import { shallowEqual } from './utils'

import type { Store } from './store'
import type { Debugger } from './debugger'
import type { State } from './debugger-flow-types'

export type EtchStoreComponentProps = {
  store: Store,
  dbg: Debugger,
  [key: string]: any
}

declare type StoreToProps<NewProps> = (props: EtchStoreComponentProps, state: State) => NewProps

declare type EtchStoreComponentState<NewProps> = {
  storeProps?: ?NewProps
}

export function connect <NewProps> (
  Component: Class<etch$Component<NewProps>>,
  storeToProps: StoreToProps<NewProps>
) {
  return class Container extends EtchComponent<EtchStoreComponentProps, EtchStoreComponentState<NewProps>> {
    _subscriptions: CompositeDisposable

    getInitialState (): EtchStoreComponentState<NewProps> {
      return { storeProps: null }
    }

    init () {
      this._subscriptions = new CompositeDisposable(
        { dispose: this.props.store.subscribe(this.handleStoreChange.bind(this)) }
      )

      this.updateComponentProps()
    }

    dispose () {
      this._subscriptions.dispose()
      delete this._subscriptions

      super.dispose()
    }

    render () {
      const { storeProps } = this.state
      if (storeProps == null) {
        return null
      }
      return etch.dom(Component, storeProps, this.children)
    }

    handleStoreChange () {
      this.updateComponentProps()
    }

    updateComponentProps () {
      const storeProps: NewProps = storeToProps(this.props, this.props.store.getState())
      if (this.state.storeProps != null && shallowEqual(this.state.storeProps, storeProps)) {
        return
      }
      this.setState({ storeProps })
    }
  }
}
