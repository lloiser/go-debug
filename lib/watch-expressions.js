/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { EtchComponent } from './etch-component'
import { connect } from './etch-store-component'
import { TextInput } from './text-input'
import { Variables } from './variables'

import type { Debugger } from './debugger'
import type { State, WatchExpression } from './debugger-flow-types'
import type { EtchStoreComponentProps } from './etch-store-component'

declare type WatchExpressionsProps = {|
  expressions: WatchExpression[],
  dbg: Debugger
|}
export class WatchExpressions extends EtchComponent<WatchExpressionsProps> {
  handleAddClick: Function
  handleRemoveClick: Function

  init () {
    this.handleAddClick = this.handleAddClick.bind(this)
    this.handleRemoveClick = this.handleRemoveClick.bind(this)
  }

  render () {
    let variables
    const expressions = this.props.expressions
    if (expressions) {
      variables = expressions.map(({ expr, variables }) => {
        return <div>
          <button className='btn go-debug-btn-flat' dataset={{ expr }} onClick={this.handleRemoveClick}>
            <span className='go-debug-icon icon icon-x' />
          </button>
          <Variables variables={variables} path='' />
        </div>
      })
    } else {
      variables = <div className='go-debug-panel-watch-expressions-empty'>No watch expressions</div>
    }

    return <div className='go-debug-panel-watch-expressions native-key-bindings' tabIndex={-1}>
      <AddWatchExpressionInput onAdd={this.handleAddClick} />
      <div className='go-debug-panel-watch-expressions-variables'>{variables}</div>
    </div>
  }

  handleAddClick (expr: string) {
    this.props.dbg.addWatchExpression(expr)
  }
  handleRemoveClick (ev: Event) {
    if (!(ev.currentTarget instanceof HTMLButtonElement)) {
      return
    }
    const { expr } = ev.currentTarget.dataset
    this.props.dbg.removeWatchExpression(expr)
  }
}

declare type AddWatchExpressionInputProps = {|
  onAdd: (value: string) => void
|}
declare type AddWatchExpressionInputState = {|
  value: string
|}
class AddWatchExpressionInput extends EtchComponent<AddWatchExpressionInputProps, AddWatchExpressionInputState> {
  handleInputChange: Function
  handleInputDone: Function

  init () {
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleInputDone = this.handleInputDone.bind(this)
  }

  getInitialState (): AddWatchExpressionInputState {
    return { value: '' }
  }

  render () {
    return <div className='go-debug-watch-expression-input'>
      <button className='btn go-debug-btn-flat' onClick={this.handleAddClick}>
        <span className='go-debug-icon icon icon-plus' />
      </button>
      <TextInput value={this.state.value} placeholder={'Add expression ...'}
        onChange={this.handleInputChange} onDone={this.handleInputDone} />
    </div>
  }

  handleInputChange (value: string) {
    this.setState({ value })
  }
  handleInputDone () {
    this.done()
  }
  handleAddClick (ev: Event) {
    ev.preventDefault()
    this.done()
  }

  done () {
    const { value } = this.state
    if (value != null && value !== '') {
      this.props.onAdd(value)
    }
    this.setState({ value: '' })
  }
}

export const WatchExpressionsContainer = connect(
  WatchExpressions,
  (props: EtchStoreComponentProps, state: State): WatchExpressionsProps => {
    return {
      dbg: props.dbg,
      expressions: state.delve.watchExpressions
    }
  }
)
