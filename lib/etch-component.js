/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { shallowEqual } from './utils'

export class EtchComponent<Props, State = void> {
  props: Props
  children: etch$Node[]
  state: State

  refs: { [key: string]: ?(etch$Element<*> | HTMLElement) }
  element: HTMLElement

  constructor (props: Props, children?: etch$Node[]) {
    this.props = props
    this.children = children || []

    if (typeof this.getInitialState === 'function') {
      this.state = this.getInitialState()
    }

    if (typeof this.init === 'function') {
      this.init()
    }

    etch.initialize(this)
  }

  shouldUpdate (newProps: Props, newState: ?State) {
    return !(
      shallowEqual(this.props, newProps, { 'on': shallowEqual }) &&
      shallowEqual(this.state, newState)
    )
  }

  update (props: Props, children?: etch$Node[] = this.children): Promise<void> {
    if (!this.shouldUpdate(props, this.state)) {
      return Promise.resolve()
    }
    this.props = props
    this.children = children
    return etch.update(this)
  }

  setState (state: $Shape<State>): Promise<void> {
    const newState = { ...this.state, ...state }
    if (!this.shouldUpdate(this.props, newState)) {
      return Promise.resolve()
    }
    this.state = newState
    return etch.update(this)
  }

  destroy (removeNode: boolean = false) {
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
