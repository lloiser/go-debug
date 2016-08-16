'use babel'

/* eslint-disable no-use-before-define */

export function create (rawVariables) {
  const variables = {}

  function addVariable (parentPath, variable) {
    const path = pathJoin(parentPath, variable.path)
    const { children } = variable
    variables[path] = {
      name: variable.name,
      loaded: true,
      hasChildren: children ? !!children.length : false,
      value: variable.value,
      parentPath
    }
    if (children) {
      children.forEach((v) => {
        addVariable(path, v)
      })
    }
  }

  rawVariables.map((variable) => {
    const v = factory.variable(variable)
    v.path = v.name = variable.name
    addVariable('', v)
  })

  return variables
}

function pathJoin (...items) {
  return items.filter((i) => i !== '').join('.')
}

const factory = {
  variable (variable) {
    if (variable.unreadable !== '') {
      return { value: `(unreadable ${variable.unreadable})` }
    }

    if (!variable.value && variable.addr === 0) {
      return { value: [shortType(variable.type), nil()] }
    }

    let fn = KINDS[variable.kind]
    if (fn.startsWith('complex')) {
      fn = 'complex'
    } else if (!factory[fn]) {
      fn = 'default'
    }
    return factory[fn](variable)
  },
  array (variable) {
    return factory.slice(variable)
  },
  slice (variable) {
    const children = variable.children.map((c, i) => {
      const { value, children } = factory.variable(c)
      return { path: i, name: formatNumber(i), value, children }
    })

    const diff = variable.len - variable.children.length
    if (diff > 0) {
      children.push({ path: 'more', name: `... +${diff} more` })
    }

    const kind = KINDS[variable.kind]
    const typeInfo = kind === 'slice' && ['(len: ', formatNumber(variable.len), ', cap: ', formatNumber(variable.cap), ')']
    return {
      value: [shortType(variable.type), typeInfo],
      children
    }
  },
  ptr (variable) {
    const child = variable.children[0]
    if (variable.type === '') {
      return { value: nil() }
    }

    if (child.onlyAddr) {
      return {
        value: ['(', shortType(variable.type), ')(', formatAddr(child), ')']
      }
    }
    const { value, children } = factory.variable(child)
    return {
      value: ['*', value],
      children
    }
  },
  unsafePointer (variable) {
    return {
      value: ['unsafe.Pointer(', formatAddr(variable.children[0]), ')']
    }
  },
  string (variable) {
    const diff = variable.len - variable.value.length
    return {
      value: {
        className: 'string',
        value: [
          '"' + variable.value + '"',
          diff > 0 && `... +${diff} more`
        ]
      }
    }
  },
  chan (variable) {
    // could also be rendered as struct
    // return factory.struct(variable)

    let content
    if (variable.children.length === 0) {
      content = nil()
    } else {
      const c0 = factory.variable(variable.children[0])
      const c1 = factory.variable(variable.children[1])
      if (c0.children) {
        console.log(variable.children[0])
      }
      if (c1.children) {
        console.log(variable.children[1])
      }
      content = [c0.value, '/', c1.value]
    }
    return {
      value: [shortType(variable.type), content]
    }
  },
  struct (variable) {
    const type = shortType(variable.type)
    const diff = variable.len - variable.children.length
    if (diff > 0) {
      return {
        value: [
          type && ['(*', type, ')'],
          '(', formatAddr(variable), ')'
        ]
      }
    }

    const children = variable.children.map((c) => {
      const { value, children } = factory.variable(c)
      return { path: c.name, name: c.name, value, children }
    })
    return {
      value: type,
      children
    }
  },
  interface (variable) {
    const child = variable.children[0]
    if (child.kind === 0 && child.addr === 0) {
      return {
        value: [shortType(variable.type), nil()]
      }
    }

    // nicer handling for errors
    if (variable.type === 'error' && child.type === '*struct errors.errorString') {
      return {
        value: [
          'error ',
          factory.variable(child.children[0].children[0]).value
        ]
      }
    }

    const { value, children } = factory.variable(child)
    return {
      value: [shortType(variable.type), ' (', value, ')'],
      children
    }
  },
  map (variable) {
    const children = []
    for (let i = 0; i < variable.children.length; i += 2) {
      const { value: kv, children: kc } = factory.variable(variable.children[i])
      const { value: vv, children: vc } = factory.variable(variable.children[i + 1])
      if (!kc && !vc) {
        children.push({ path: i, name: kv, value: vv })
      } else {
        children.push({
          path: i,
          name: '{ key, value }',
          children: [
            { path: 'key', name: 'key', value: kv, children: kc },
            { path: 'value', name: 'value', value: vv, children: vc }
          ]
        })
      }
    }

    const diff = variable.len - variable.children.length / 2
    if (diff > 0) {
      children.push({ path: 'more', name: `... +${diff} more` })
    }

    return {
      value: shortType(variable.type),
      children: children
    }
  },
  func (variable) {
    return {
      value: variable.value ? shortType(variable.value) : nil()
    }
  },
  complex (variable) {
    const { value: v0 } = factory.variable(variable.children[0])
    const { value: v1 } = factory.variable(variable.children[1])
    return { value: ['(', v0, v1, 'i)'] }
  },
  default (variable) {
    const kind = KINDS[variable.kind]
    let className
    if (variable.value) {
      if (kind.match(NUMERIC_REGEX)) {
        className = 'constant numeric'
      } else if (kind === 'bool') {
        className = 'constant language'
      }
    }
    return {
      value: { className, value: variable.value || '(unknown ' + KINDS[variable.kind] + ')' }
    }
  }
}

const NUMERIC_REGEX = /^(u)?(int|float)/
const KINDS = [
  'invalid',
  'bool',
  'int',
  'int8',
  'int16',
  'int32',
  'int64',
  'uint',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
  'uintptr',
  'float32',
  'float64',
  'complex64',
  'complex128',
  'array',
  'chan',
  'func',
  'interface',
  'map',
  'ptr',
  'slice',
  'string',
  'struct',
  'unsafePointer'
  // total: 27...
]

function shortType (type) {
  if (!type) {
    return ''
  }
  if (type.startsWith('map[')) {
    // does not work maps with maps:
    // map[map[int]string]float32
    // map[float32]map[int]string
    // map[map[int]string]map[float32]string
    const parts = type.split(']')
    return ['map[', shortType(parts[0].substr(4)), ']', shortType(parts[1])]
  }
  if (type.startsWith('struct ')) {
    type = type.substr('struct '.length)
  }
  let t = ''
  if (type.startsWith('[')) {
    let closingIndex = type.indexOf(']')
    if (closingIndex >= 0) {
      closingIndex++
      t = type.substring(0, closingIndex)
      type = type.substring(closingIndex)
    }
  }
  if (type.startsWith('*')) {
    t += '*'
    type = type.substring(1)
  }
  t += type.split('/').pop()
  return t
}
function nil () { return { value: ' nil', className: 'constant language' } }
function formatNumber (value) { return { value, className: 'constant numeric' } }
function formatAddr (variable) { return formatNumber('0x' + variable.addr.toString(16)) }
