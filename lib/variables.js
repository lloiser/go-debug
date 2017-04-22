'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'
import EtchStoreComponent from './etch-store-component'
import { editorStyle } from './utils'

export class Variables extends EtchComponent {
  constructor (props, children) {
    if (!props.path) {
      props.path = ''
    }
    if (!props.expanded) {
      props.expanded = {}
    }
    super(props, children)
  }
  render () {
    const variables = this.props.variables || {}
    if (Object.keys(variables).length === 0) {
      return <div className='go-debug-panel-variables-empty'>No variables</div>
    }
    return <div style={editorStyle()} className='go-debug-panel-variables native-key-bindings' onclick={this.handleToggleClick} tabIndex={-1}>
      <Children variables={variables} path={this.props.path} expanded={this.props.expanded} />
    </div>
  }
  handleToggleClick (ev) {
    const path = ev.target.dataset.path
    if (!path) {
      return
    }

    // load the variable if not done already
    const v = this.props.variables[path]
    if (v && !v.loaded) {
      this.props.dbg.loadVariable(path, v)
      return
    }

    const { expanded } = this.props
    this.update({
      expanded: Object.assign({}, expanded, { [path]: !expanded[path] })
    })
  }
}
Variables.bindFns = ['handleToggleClick']

export const VariablesContainer = EtchStoreComponent.create(
  Variables,
  (state) => {
    const { delve } = state
    return {
      variables: (delve.stacktrace[delve.selectedStacktrace] || {}).variables
    }
  }
)

class Variable extends EtchComponent {
  shouldUpdate (newProps) {
    // new variables? new path? update!
    const { variables, path, expanded } = this.props
    if (newProps.variables !== variables || newProps.path !== path) {
      return true
    }

    const newExpanded = newProps.expanded
    const equalsExpanded = (p) => newExpanded[p] === expanded[p]

    // only update if the expanded state if this variable or one
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

class Children extends EtchComponent {
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
    const vars = children.map((p, i) =>
      <Variable key={i} path={p} variables={variables} expanded={expanded} />
    )
    return <ol>{vars}</ol>
  }
}

function renderValue (value) {
  if (Array.isArray(value)) {
    return value.map((v, i) => <span key={i}>{renderValue(v)}</span>)
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const v = renderValue(value.value)
    return value.className ? <span className={value.className}>{v}</span> : v
  }
  return (value === undefined || value === null || value === false) ? '' : value
}

function name (path) {
  return path.split('.').slice(-1)[0] || path
}
