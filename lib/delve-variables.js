/* @flow */

import type { DelveVariable } from './delve-flow-types'

import type { Variables, ClassyString } from './debugger-flow-types'

export function create (rawVariables: DelveVariable[]): Variables {
  const variables: Variables = {}

  function addVariable (parentPath, variable) {
    const path = pathJoin(parentPath, variable.path)
    const { children } = variable
    variables[path] = {
      name: variable.name || '',
      hasChildren: children ? !!children.length : false,
      value: variable.value,
      parentPath,
      type: variable.kind || ''
    }
    if (children) {
      children.forEach((v) => {
        addVariable(path, v)
      })
    }
  }

  rawVariables.forEach((variable) => {
    const v = toVariable(variable)
    addVariable('', v)
  })

  return variables
}

export function createError (message: string, name: string = 'err'): Variables {
  return {
    [name]: {
      name,
      hasChildren: false,
      value: formatString(message),
      parentPath: '',
      type: 'interface'
    }
  }
}

function pathJoin (...items) {
  return items.filter((i) => i !== '').join('.')
}

declare type FactoryVariable = {|
  path?: string,
  name?: ClassyString,
  value: ClassyString,
  children?: FactoryVariable[],
  kind?: string,
|}

function toVariable (variable: DelveVariable): FactoryVariable {
  const { name } = variable
  let kind = KINDS[variable.kind]
  if (variable.unreadable !== '') {
    return { value: `(unreadable ${variable.unreadable})`, kind, name, path: name }
  }

  if (!variable.value && variable.addr === 0) {
    return { value: [shortType(variable.type), nil()], kind, name, path: name }
  }

  let v: FactoryVariable
  if (kind.startsWith('complex')) {
    kind = 'complex'
    v = factory.complex(variable)
  } else if (kind in factory) {
    v = factory[kind](variable)
  } else {
    v = factory.default(variable)
  }
  if (v.kind == null) {
    v.kind = kind
  }
  if (v.path == null) {
    v.path = name
  }
  if (v.name == null) {
    v.name = name
  }
  return v
}

const factory: { [key: string]: (variable: DelveVariable) => FactoryVariable } = {
  array (variable: DelveVariable) {
    return factory.slice(variable)
  },
  slice (variable: DelveVariable) {
    const children = variable.children.filter(Boolean).map((c, i) => {
      const { value, children } = toVariable(c)
      return { path: i + '', name: formatNumber(i), value, children }
    })

    const diff = variable.len - variable.children.length
    if (diff > 0) {
      children.push({ value: '', path: 'more', name: `... +${diff} more` })
    }

    const kind = KINDS[variable.kind]
    const typeInfo = kind === 'slice' ? ['(len: ', formatNumber(variable.len), ', cap: ', formatNumber(variable.cap), ')'] : ''
    return {
      value: [shortType(variable.type), typeInfo],
      children
    }
  },
  ptr (variable: DelveVariable) {
    const child = variable.children[0]
    if (!child) {
      return { value: nil() }
    }

    if (variable.type === '') {
      return { value: nil() }
    }

    if (child.onlyAddr) {
      return {
        value: ['(', shortType(variable.type), ')(', formatAddr(child), ')']
      }
    }
    const { value, children } = toVariable(child)
    return {
      value: ['*', value],
      children
    }
  },
  unsafePointer (variable: DelveVariable) {
    return {
      value: ['unsafe.Pointer(', variable.children[0] ? formatAddr(variable.children[0]) : '...', ')']
    }
  },
  string (variable: DelveVariable) {
    return { value: formatString(variable.value, variable.len - variable.value.length) }
  },
  chan (variable: DelveVariable) {
    // could also be rendered as struct
    // return factory.struct(variable)

    let content
    const [c0, c1] = variable.children
    if (!c0 || !c1) {
      content = nil()
    } else {
      content = [' ', toVariable(c0).value, '/', toVariable(c1).value]
    }
    return {
      value: [shortType(variable.type), content]
    }
  },
  struct (variable: DelveVariable) {
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

    const children = variable.children.filter(Boolean).map((c) => {
      const { value, children } = toVariable(c)
      return { path: c.name, name: c.name, value, children }
    })
    return {
      value: type,
      children
    }
  },
  interface (variable: DelveVariable) {
    const child = variable.children[0]
    if (!child || (child.kind === 0 && child.addr === 0)) {
      return {
        value: [shortType(variable.type), nil()]
      }
    }

    // nicer handling for errors
    if (variable.type === 'error' && child.type === '*errors.errorString') {
      const c = child.children[0]
      if (c) {
        const err = c.children[0]
        if (err) {
          return {
            value: [
              'error ',
              toVariable(err).value
            ]
          }
        }
      }
      return {
        value: ['error(', formatAddr(child), ')']
      }
    }

    const { value, children } = toVariable(child)
    return {
      value: [shortType(variable.type), ' (', value, ')'],
      children
    }
  },
  map (variable: DelveVariable) {
    const children = []
    for (let i = 0; i < variable.children.length; i += 2) {
      const path = i + ''
      const ci = variable.children[i]
      const ci1 = variable.children[i + 1]
      if (!ci || !ci1) {
        continue
      }
      const { value: kv, children: kc } = toVariable(ci)
      const { value: vv, children: vc } = toVariable(ci1)
      if (!kc && !vc) {
        children.push({ path, name: kv, value: vv })
      } else if (!kc) {
        children.push({
          path,
          name: kv,
          value: vv,
          children: vc
        })
      } else {
        children.push({
          path,
          name: '{ key, value }',
          value: '',
          children: [
            { path: 'key', name: 'key', value: kv, children: kc },
            { path: 'value', name: 'value', value: vv, children: vc }
          ]
        })
      }
    }

    const diff = variable.len - (variable.children.length / 2)
    if (diff > 0) {
      children.push({ value: '', path: 'more', name: `... +${diff} more` })
    }

    return {
      value: shortType(variable.type),
      children: children
    }
  },
  func (variable: DelveVariable) {
    return {
      value: variable.value ? shortType(variable.value) : nil()
    }
  },
  complex (variable: DelveVariable) {
    const [c0, c1] = variable.children
    if (!c0 || !c1) {
      return { value: nil() }
    }
    const { value: v0 } = toVariable(c0)
    const { value: v1 } = toVariable(c1)
    return { value: ['(', v0, ' + ', v1, 'i)'] }
  },
  default (variable: DelveVariable) {
    const kind = KINDS[variable.kind]
    let className
    if (variable.value) {
      if (kind.match(NUMERIC_REGEX)) {
        className = 'syntax--constant syntax--numeric constant numeric'
      } else if (kind === 'bool') {
        className = 'syntax--constant syntax--language language'
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

function shortType (type: ?string): ClassyString {
  if (type == null) {
    return ''
  }
  if (type.startsWith('map[')) {
    const parts = type.split(']')
    if (parts.length > 2) {
      // TODO: this does not work for complex types
      // "map[float32]map[int]string"
      // "map[string][2]int32"
      // "map[string]func(*net/http.Server, *crypto/tls.Conn, net/http.Handler)"
      // "map[string]map[string]github.com/nicksnyder/go-i18n/i18n/translation.Translation"
      // "map[net/http.http2FrameType]map[net/http.http2Flags]string"
      return type
    }
    return ['map[', shortType(parts[0].substr(4)), ']', shortType(parts[1])]
  }
  let t = type
  if (type.startsWith('struct ')) {
    t = t.substr('struct '.length)
  }
  let prefix = ''
  if (t.startsWith('[')) {
    let closingIndex = t.indexOf(']')
    if (closingIndex >= 0) {
      closingIndex++
      prefix = t.substring(0, closingIndex)
      t = t.substring(closingIndex)
    }
  }
  if (t.startsWith('*')) {
    prefix += '*'
    t = t.substring(1)
  }
  return prefix + t.split('/').pop()
}
function nil (): ClassyString {
  return { value: ' nil', className: 'syntax--constant syntax--language constant language' }
}
function formatString (value: string, more: number = 0): ClassyString {
  return {
    value: [
      '"' + value + '"',
      more > 0 ? `... +${more} more` : ''
    ],
    className: 'syntax--string string'
  }
}
function formatNumber (value: string | number): ClassyString {
  return { value: value + '', className: 'syntax--constant syntax--numeric constant numeric' }
}
function formatAddr (variable: DelveVariable): ClassyString {
  return formatNumber('0x' + variable.addr.toString(16))
}
