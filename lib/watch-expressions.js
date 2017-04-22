'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'
import EtchStoreComponent from './etch-store-component'
import TextInput from './text-input'
import { Variables } from './variables'

export class WatchExpressions extends EtchComponent {
  render () {
    let variables
    const expressions = this.props.expressions
    if (expressions) {
      variables = expressions.map(({ expr, variables }) => {
        return <div>
          <button className='btn go-debug-btn-flat' dataset={{ expr }} onClick={this.handleRemoveClick}>
            <span className='go-debug-icon icon icon-x' />
          </button>
          <Variables variables={variables} />
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

  handleAddClick (expr) {
    this.props.dbg.addWatchExpression(expr)
  }
  handleRemoveClick (ev) {
    const { expr } = ev.currentTarget.dataset
    this.props.dbg.removeWatchExpression(expr)
  }
}
WatchExpressions.bindFns = ['handleAddClick', 'handleRemoveClick']

class AddWatchExpressionInput extends EtchComponent {
  render () {
    return <div className='go-debug-watch-expression-input'>
      <button className='btn go-debug-btn-flat' onClick={this.handleAddClick}>
        <span className='go-debug-icon icon icon-plus' />
      </button>
      <TextInput value={this.props.value} placeholder={'Add expression ...'}
        onChange={this.handleInputChange} onDone={this.handleInputDone} />
    </div>
  }

  handleInputChange (value) {
    this.update({ value })
  }
  handleInputDone (value) {
    this.done()
  }
  handleAddClick (ev) {
    ev.preventDefault()
    this.done()
  }

  done () {
    if (this.props.onAdd && this.props.value) {
      this.props.onAdd(this.props.value)
    }
    this.update({ value: '' })
  }
}
AddWatchExpressionInput.bindFns = ['handleInputChange', 'handleInputDone', 'handleAddClick']

export const WatchExpressionsContainer = EtchStoreComponent.create(
  WatchExpressions,
  (state) => {
    return {
      expressions: state.delve.watchExpressions
    }
  }
)
