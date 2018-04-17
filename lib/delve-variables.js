'use babel'

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
      parentPath,
      type: variable.kind
    }
    if (children) {
      children.forEach((v) => {
        addVariable(path, v)
      })
    }
  }

  rawVariables.forEach((variable) => {
    const v = factory.variable(variable, true)
    v.path = v.name = variable.name
    addVariable('', v)
  })

  return variables
}

export function createError (message, name = 'err') {
  return {
    [name]: {
      name,
      loaded: true,
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

const factory = {
  variable (variable, top) {
    let kind = KINDS[variable.kind]
    if (variable.unreadable !== '') {
      return { value: `(unreadable ${variable.unreadable})`, kind }
    }

    if (!variable.value && variable.addr === 0 && !top) {
      return { value: [shortType(variable.type), nil()], kind }
    }

    if (kind.startsWith('complex')) {
      kind = 'complex'
    } else if (!factory[kind]) {
      kind = 'default'
    }
    const v = factory[kind](variable)
    v.kind = kind
    return v
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
    return formatString(variable.value, variable.len - variable.value.length)
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
      content = [' ', c0.value, '/', c1.value]
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
    if (variable.type === 'error' && child.type === '*errors.errorString') {
      const c = child.children[0]
      if (c) {
        const err = c.children[0]
        if (err) {
          return {
            value: [
              'error ',
              factory.variable(err).value
            ]
          }
        }
      }
      return {
        value: ['error(', formatAddr(child), ')']
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
      } else if (!kc) {
        children.push({
          path: i,
          name: kv,
          value: vv,
          children: vc
        })
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

    const diff = variable.len - (variable.children.length / 2)
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
    return { value: ['(', v0, ' + ', v1, 'i)'] }
  },
  default (variable) {
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

function shortType (type) {
  if (!type) {
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
function nil () { return { value: ' nil', className: 'syntax--constant syntax--language constant language' } }
function formatString (value, more = 0) {
  return {
    value: {
      value: [
        '"' + value + '"',
        more > 0 ? `... +${more} more` : null
      ],
      className: 'syntax--string string'
    }
  }
}
function formatNumber (value) { return { value, className: 'syntax--constant syntax--numeric constant numeric' } }
function formatAddr (variable) { return formatNumber('0x' + variable.addr.toString(16)) }
