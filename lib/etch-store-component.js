'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import { CompositeDisposable } from 'atom'

import EtchComponent from './etch-component'
import { shallowEqual } from './utils'

export default class EtchStoreComponent extends EtchComponent {
  constructor (props, children) {
    // all props except the "Component" will be passed through to the component
    props.passThrough = Object.keys(props).filter((key) => key !== 'Component')

    super(props, children)
  }

  init () {
    this._subscriptions = new CompositeDisposable(
      { dispose: this.props.store.subscribe(this.handleStoreChange.bind(this)) }
    )

    this.updateComponentProps()

    super.init()
  }

  dispose () {
    this._subscriptions.dispose()
    this._subscriptions = null

    super.dispose()
  }

  render () {
    const props = {}
    this.props.passThrough.forEach((key) => { props[key] = this.props[key] })
    Object.assign(props, this.props.storeProps)
    return <this.Component {...props} />
  }

  handleStoreChange () {
    this.updateComponentProps()
  }

  updateComponentProps () {
    const storeProps = this.storeToProps(this.props.store.getState())
    if (this.props.storeProps && shallowEqual(this.props.storeProps, storeProps)) {
      return
    }
    this.update({ storeProps: storeProps })
  }

  static create (Component, storeToProps) {
    return class Container extends EtchStoreComponent {
      init () {
        this.Component = Component
        this.storeToProps = storeToProps
        super.init()
      }
    }
  }
}
