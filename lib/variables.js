/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { EtchComponent } from './etch-component'
import { connect } from './etch-store-component'
import { editorStyle } from './utils'

import type { State, Variables as DebuggerVariables } from './debugger-flow-types'
import type { EtchStoreComponentProps } from './etch-store-component'

declare type VariablesProps = {|
  variables: ?DebuggerVariables,
  path: string
|}
declare type VariablesState = {|
  expanded: { [key: string]: boolean }
|}

export class Variables extends EtchComponent<VariablesProps, VariablesState> {
  handleToggleClick: Function

  getInitialState (): VariablesState {
    return { expanded: {} }
  }
  init () {
    this.handleToggleClick = this.handleToggleClick.bind(this)
  }
  render () {
    const { variables } = this.props
    if (!variables || Object.keys(variables).length === 0) {
      return <div className='go-debug-panel-variables-empty'>No variables</div>
    }
    return <div style={editorStyle()} className='go-debug-panel-variables native-key-bindings' onclick={this.handleToggleClick} tabIndex={-1}>
      <Children variables={variables} path={this.props.path} expanded={this.state.expanded} />
    </div>
  }
  handleToggleClick (ev: MouseEvent) {
    const { target } = ev
    if (!(target instanceof HTMLElement)) {
      return
    }
    const path = target.dataset.path
    if (!path) {
      return
    }

    const { expanded } = this.state
    this.setState({
      expanded: { ...expanded, [path]: !expanded[path] }
    })
  }
}

export const VariablesContainer = connect(
  Variables,
  (props: EtchStoreComponentProps, state: State): VariablesProps => {
    const { delve } = state
    const stack = delve.stacktrace[delve.selectedStacktrace]
    return {
      path: typeof props.path === 'string' ? props.path : '',
      variables: stack ? stack.variables : null
    }
  }
)

declare type VariableProps = {|
  path: string,
  variables: DebuggerVariables,
  expanded: { [key: string]: boolean },
  key?: string
|}
class Variable extends EtchComponent<VariableProps> {
  shouldUpdate (newProps: VariableProps) {
    // new variables? new path? update!
    const { variables, path, expanded } = this.props
    if (newProps.variables !== variables || newProps.path !== path) {
      return true
    }

    const newExpanded = newProps.expanded
    const equalsExpanded = (p) => newExpanded[p] === expanded[p]

    // only update if the expanded state of this variable or one
    // of it's children has changed
    if (!equalsExpanded(path)) {
      return true
    }
    const children = Object.keys(newExpanded).filter((p) => p.startsWith(path + '.'))
    return !children.every(equalsExpanded)
  }
  render () {
    const { variables, path, expanded } = this.props
    const variable = variables[path]
    const isExpanded = variable.hasChildren && expanded[path]
    let toggleClassName = 'go-debug-icon icon icon-chevron-' + (isExpanded ? 'down' : 'right')
    if (!variable.hasChildren) {
      toggleClassName += ' go-debug-toggle-hidden'
    }

    let name
    let value
    if (variable.value) {
      name = <span className='go-debug-panel-variables-name'>{renderValue(variable.name)}: </span>
      value = <span className='go-debug-panel-variables-value'>{renderValue(variable.value)}</span>
    } else {
      name = <span className='go-debug-panel-variables-name'>{renderValue(variable.name)}</span>
    }

    return <li>
      <div>
        <span className={toggleClassName} dataset={{ path }} />
        {name || null}
        {value || null}
      </div>
      {isExpanded ? <Children variables={variables} path={path} expanded={expanded} /> : null}
    </li>
  }
}

declare type ChildrenProps = {|
  path: string,
  variables: DebuggerVariables,
  expanded: { [key: string]: boolean }
|}
class Children extends EtchComponent<ChildrenProps> {
  render () {
    const { variables, path, expanded } = this.props
    const children = Object.keys(variables || {}).filter((p) => variables[p].parentPath === path)
    if (!children.length) {
      return <div />
    }
    const v = variables[path]
    if (v && (v.type === 'slice' || v.type === 'array')) {
      children.sort((p1, p2) => {
        if (p1.endsWith('more')) {
          return 1
        }
        if (p2.endsWith('more')) {
          return -1
        }
        return parseInt(name(p1), 10) - parseInt(name(p2), 10)
      })
    } else {
      children.sort()
    }
    const vars = children.map((p) =>
      <Variable key={p} path={p} variables={variables} expanded={expanded} />
    )
    return <ol>{vars}</ol>
  }
}

function renderValue (value) {
  if (Array.isArray(value)) {
    return value.map((v, i) => <span key={i}>{renderValue(v)}</span>)
  }
  if (value && typeof value === 'object') {
    const v = renderValue(value.value)
    return value.className != null ? <span className={value.className}>{v}</span> : v
  }
  return (value === undefined || value === null || value === false) ? '' : value
}

function name (path) {
  return path.split('.').slice(-1)[0] || path
}
