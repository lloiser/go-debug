'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import { shallowEqual } from './utils'

export default class EtchComponent {
  constructor (props, children) {
    this.props = props
    this.children = children

    const { bindFns } = this.constructor
    if (bindFns) {
      bindFns.forEach((fn) => { this[fn] = this[fn].bind(this) })
    }

    this.init()
  }

  init () {
    etch.initialize(this)
  }

  shouldUpdate (newProps) {
    return !shallowEqual(this.props, newProps)
  }

  update (props, children) {
    if (!this.shouldUpdate(props)) {
      return Promise.resolve()
    }
    this.props = Object.assign({}, this.props, props)
    this.children = children
    return etch.update(this)
  }

  destroy (removeNode = false) {
    etch.destroy(this, removeNode)
  }

  dispose () {
    this.destroy()
  }

  render () {
    throw new Error('Etch components must implement a `render` method')
  }
}

etch.setScheduler(atom.views)
